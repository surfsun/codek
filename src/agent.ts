import OpenAI from 'openai';
import type {
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionToolMessageParam,
    ChatCompletionAssistantMessageParam,
    ChatCompletionTool,
} from 'openai/resources/chat/completions';

// DeepSeek reasoning models return reasoning_content on assistant messages,
// and the API requires it to be passed back in subsequent requests.
type DeepSeekAssistantMessage = ChatCompletionAssistantMessageParam & {
    reasoning_content?: string | null;
};

type CodekMessage =
    | ChatCompletionSystemMessageParam
    | ChatCompletionUserMessageParam
    | ChatCompletionToolMessageParam
    | DeepSeekAssistantMessage;
import { CodekConfig } from './config.js';
import { logger } from './logger.js';
import { buildInitialMessages } from './prompts/context.js';
import { createTools, runTool } from './runtime.js';
import { AgentAction, AgentEvent, ConversationArchive, MemoryRecord, SummaryStore, ToolDefinition } from './types.js';

function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    }));
}

function parseToolArguments(call: ChatCompletionMessageFunctionToolCall): Record<string, unknown> {
    const raw = call.function.arguments.trim();
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Tool arguments for ${call.function.name} must be a JSON object.`);
    }

    return parsed as Record<string, unknown>;
}

function parseFallbackAction(text: string | null): AgentAction | null {
    if (!text) return null;

    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = fenced ? fenced[1] : trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start < 0 || end < start) return null;

    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1)) as AgentAction;
        if (parsed.type === 'final' && typeof parsed.content === 'string') return parsed;
        if (parsed.type === 'tool' && typeof parsed.name === 'string') return parsed;
        return null;
    } catch {
        return null;
    }
}

function requestLikelyNeedsTool(input: string) {
    return /添加|修改|删除|修复|实现|更新|提交|commit|add|change|modify|delete|fix|implement|update|write/i.test(input);
}

type StreamedMessage = DeepSeekAssistantMessage & {
    tool_calls?: ChatCompletionMessageFunctionToolCall[];
};

function shouldBufferVisibleText(buffer: string) {
    const trimmed = buffer.trimStart();
    return trimmed.startsWith('{') || trimmed.startsWith('```');
}

export class CodekAgent {
    private client: OpenAI | null = null;
    private readonly tools: ToolDefinition[];
    private readonly openAITools: ChatCompletionTool[];
    private messages: CodekMessage[];
    private conversationId: string | null = null;
    private memories: MemoryRecord[] = [];

    constructor(
        private readonly config: CodekConfig,
        private readonly onEvent?: (event: AgentEvent) => void,
        private readonly archive?: ConversationArchive,
        private readonly summaries?: SummaryStore,
    ) {
        this.tools = createTools(config);
        this.openAITools = toOpenAITools(this.tools);
        this.messages = buildInitialMessages(this.tools, this.memories);
    }

    private emit(event: AgentEvent) {
        this.onEvent?.(event);
    }

    setModel(model: string) {
        this.config.model = model;
    }

    getModel() {
        return this.config.model;
    }

    clear() {
        this.messages = buildInitialMessages(this.tools, this.memories);
        void this.archiveEvent('context_clear');
    }

    setMemories(memories: MemoryRecord[]) {
        this.memories = memories;
        this.messages = [
            ...buildInitialMessages(this.tools, this.memories),
            ...this.messages.filter(message => message.role !== 'system'),
        ];
    }

    private async ensureConversation() {
        if (this.conversationId || !this.archive) return this.conversationId;

        this.emit({ type: 'status', status: 'archiving', message: 'Opening conversation archive' });
        try {
            this.conversationId = await this.archive.startConversation({
                cwd: this.config.cwd,
                model: this.config.model,
                baseURL: this.config.baseURL,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`archive start failed: ${message}`);
            this.emit({ type: 'error', message: `archive start failed: ${message}` });
        }

        return this.conversationId;
    }

    private async archiveMessage(message: Parameters<ConversationArchive['appendMessage']>[1]) {
        const conversationId = await this.ensureConversation();
        if (!conversationId || !this.archive) return;

        try {
            await this.archive.appendMessage(conversationId, message);
        } catch (error) {
            const archiveError = error instanceof Error ? error.message : String(error);
            logger.warn(`archive message failed: ${archiveError}`);
            this.emit({ type: 'error', message: `archive message failed: ${archiveError}` });
        }
    }

    private async archiveEvent(type: string, content?: string, metadata?: Record<string, unknown>) {
        const conversationId = await this.ensureConversation();
        if (!conversationId || !this.archive) return;

        try {
            await this.archive.appendEvent(conversationId, { type, content, metadata });
        } catch (error) {
            const archiveError = error instanceof Error ? error.message : String(error);
            logger.warn(`archive event failed: ${archiveError}`);
            this.emit({ type: 'error', message: `archive event failed: ${archiveError}` });
        }
    }

    private async completeRun(userRequest: string, finalAnswer: string) {
        this.emit({ type: 'status', status: 'done' });
        await this.archiveEvent('final', finalAnswer);

        if (!this.summaries) return;

        const conversationId = await this.ensureConversation();
        if (!conversationId) return;

        this.emit({ type: 'status', status: 'summarizing', message: 'Saving conversation summary' });
        try {
            await this.summaries.add({
                conversationId,
                model: this.config.model,
                userRequest,
                finalAnswer,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`summary save failed: ${message}`);
            this.emit({ type: 'error', message: `summary save failed: ${message}` });
        }
    }

    private async createCompletion(): Promise<StreamedMessage | null> {
        const request = {
            model: this.config.model,
            messages: this.messages,
            tools: this.openAITools,
            tool_choice: 'auto' as const,
            temperature: 0,
            stream: true as const,
        };
        logger.llm('request', request);

        const stream = await this.client!.chat.completions.create(request);
        let content = '';
        let reasoningContent = '';
        let visibleBuffer = '';
        let visibleStarted = false;
        const toolCalls = new Map<number, ChatCompletionMessageFunctionToolCall>();

        for await (const chunk of stream) {
            logger.llm('response_chunk', chunk as unknown as Record<string, unknown>);
            const delta = chunk.choices[0]?.delta as any;
            if (!delta) continue;

            if (typeof delta.reasoning_content === 'string') {
                reasoningContent += delta.reasoning_content;
            }

            if (typeof delta.content === 'string') {
                content += delta.content;

                if (visibleStarted) {
                    this.emit({ type: 'assistant_delta', content: delta.content });
                } else {
                    visibleBuffer += delta.content;
                    if (!shouldBufferVisibleText(visibleBuffer)) {
                        visibleStarted = true;
                        this.emit({ type: 'assistant_delta', content: visibleBuffer });
                        visibleBuffer = '';
                    }
                }
            }

            for (const partialCall of delta.tool_calls ?? []) {
                const index = partialCall.index ?? 0;
                const current = toolCalls.get(index) ?? {
                    id: partialCall.id ?? '',
                    type: 'function',
                    function: {
                        name: '',
                        arguments: '',
                    },
                } as ChatCompletionMessageFunctionToolCall;

                if (partialCall.id) current.id = partialCall.id;
                if (partialCall.type) current.type = partialCall.type;
                if (partialCall.function?.name) current.function.name += partialCall.function.name;
                if (partialCall.function?.arguments) current.function.arguments += partialCall.function.arguments;
                toolCalls.set(index, current);
            }
        }

        const orderedToolCalls = Array.from(toolCalls.entries())
            .sort(([left], [right]) => left - right)
            .map(([, call]) => call);
        const message: StreamedMessage = {
            role: 'assistant',
            content,
            reasoning_content: reasoningContent || undefined,
        };

        if (orderedToolCalls.length > 0) {
            message.tool_calls = orderedToolCalls;
        } else if (!visibleStarted && visibleBuffer) {
            const fallbackAction = parseFallbackAction(content);
            if (!fallbackAction) {
                this.emit({ type: 'assistant_delta', content: visibleBuffer });
            }
        }

        logger.llm('response_complete', {
            content,
            reasoning_content: reasoningContent || undefined,
            tool_calls: orderedToolCalls,
        });
        return message;
    }

    async run(input: string): Promise<string> {
        this.client ??= new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseURL,
        });

        this.emit({ type: 'status', status: 'building_context', message: 'Adding user request to context' });
        this.messages.push({ role: 'user', content: input });
        await this.archiveMessage({ role: 'user', content: input });
        const needsTool = requestLikelyNeedsTool(input);
        let successfulTool = false;
        const deadline = Date.now() + this.config.maxRunMs;

        for (let step = 1; step <= this.config.maxSteps; step++) {
            if (Date.now() > deadline) {
                this.emit({ type: 'status', status: 'error', message: 'Time budget exceeded' });
                await this.archiveEvent('error', `Stopped after ${this.config.maxRunMs}ms without a final answer.`);
                return `Stopped after ${Math.round(this.config.maxRunMs / 1000)} seconds without a final answer.`;
            }

            logger.step(`agent step ${step}`);
            this.emit({ type: 'step', step, maxSteps: this.config.maxSteps });
            this.emit({ type: 'status', status: 'thinking', message: 'Thinking' });

            const message = await this.createCompletion();
            const text = typeof message?.content === 'string' ? message.content : '';
            const reasoningContent = (message as any)?.reasoning_content ?? undefined;
            logger.info(`model: ${text}`);
            if (text.trim()) {
                this.emit({ type: 'model', content: text });
            }

            if (!message) {
                this.messages.push({
                    role: 'user',
                    content: 'The previous response was empty. Continue with a final answer or a tool call.',
                });
                continue;
            }

            if (!message.tool_calls?.length) {
                const fallbackAction = parseFallbackAction(text);

                if (fallbackAction?.type === 'tool') {
                    this.messages.push({ role: 'assistant', content: text, reasoning_content: reasoningContent });
                    await this.archiveMessage({
                        role: 'assistant',
                        content: text,
                        metadata: { fallbackAction: true },
                    });

                    this.emit({ type: 'tool_start', name: fallbackAction.name });
                    this.emit({ type: 'status', status: 'running_tool', message: fallbackAction.name });
                    const result = await runTool(this.tools, fallbackAction.name, fallbackAction.input ?? {});
                    successfulTool ||= result.ok;
                    this.emit({ type: 'tool_end', name: fallbackAction.name, ok: result.ok });
                    logger.tool(`${fallbackAction.name}: ${result.content}`);
                    await this.archiveMessage({
                        role: 'tool',
                        name: fallbackAction.name,
                        ok: result.ok,
                        content: result.content,
                        metadata: { fallbackAction: true },
                    });

                    this.messages.push({
                        role: 'user',
                        content: JSON.stringify({
                            type: 'tool_result',
                            tool: fallbackAction.name,
                            ok: result.ok,
                            content: result.content.slice(0, 30_000),
                        }),
                    });
                    continue;
                }

                if (fallbackAction?.type === 'final') {
                    if (needsTool && !successfulTool) {
                        this.messages.push({ role: 'assistant', content: text, reasoning_content: reasoningContent });
                        this.messages.push({
                            role: 'user',
                            content: 'You returned a final answer for a task that requires inspecting or changing the project, but no local tool has succeeded in this run. Use a native tool call, or return exactly one fallback JSON tool action.',
                        });
                        continue;
                    }

                    await this.completeRun(input, fallbackAction.content);
                    return fallbackAction.content;
                }

                if (needsTool && !successfulTool) {
                    this.messages.push({ role: 'assistant', content: text, reasoning_content: reasoningContent });
                    this.messages.push({
                        role: 'user',
                        content: 'This task requires inspecting or changing the local project. Do not explain or claim completion yet. Use a native tool call, or return exactly one fallback JSON tool action.',
                    });
                    continue;
                }

                await this.completeRun(input, text);
                return text;
            }

            this.messages.push({
                role: 'assistant',
                content: text,
                reasoning_content: reasoningContent,
                tool_calls: message.tool_calls,
            });
            await this.archiveMessage({
                role: 'assistant',
                content: text,
                metadata: { toolCalls: message.tool_calls },
            });

            for (const call of message.tool_calls) {
                let resultContent: string;
                let toolName: string = call.type;

                try {
                    if (call.type !== 'function') {
                        throw new Error(`Unsupported tool call type: ${call.type}`);
                    }

                    toolName = call.function.name;
                    const input = parseToolArguments(call);
                    this.emit({ type: 'tool_start', name: call.function.name });
                    this.emit({ type: 'status', status: 'running_tool', message: call.function.name });
                    const result = await runTool(this.tools, call.function.name, input);
                    successfulTool ||= result.ok;
                    this.emit({ type: 'tool_end', name: call.function.name, ok: result.ok });
                    resultContent = JSON.stringify({
                        ok: result.ok,
                        content: result.content.slice(0, 30_000),
                    });
                    await this.archiveMessage({
                        role: 'tool',
                        name: call.function.name,
                        ok: result.ok,
                        content: result.content,
                    });
                    logger.tool(`${call.function.name}: ${result.content}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    resultContent = JSON.stringify({ ok: false, content: message });
                    this.emit({ type: 'tool_end', name: toolName, ok: false });
                    this.emit({ type: 'error', message });
                    await this.archiveMessage({
                        role: 'tool',
                        name: toolName,
                        ok: false,
                        content: message,
                    });
                    logger.tool(`${toolName}: ${message}`);
                }

                this.messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: resultContent,
                });
            }
        }

        this.emit({ type: 'status', status: 'error', message: `Stopped after ${this.config.maxSteps} steps` });
        await this.archiveEvent('error', `Stopped after internal safety limit without a final answer.`);
        return `Stopped after the internal safety limit without a final answer.`;
    }
}
