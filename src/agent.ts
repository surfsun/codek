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
import { createTools, runTool } from './runtime.js';
import { AgentAction, ToolDefinition } from './types.js';

function buildSystemPrompt(tools: ToolDefinition[]) {
    const fallbackTools = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
    }));

    return `You are codek, a terminal coding agent.

Work like Codex or Claude Code in a local project:
- Inspect the repository before changing code.
- Prefer small, focused edits that solve the user request.
- Use tools one step at a time and wait for each result.
- Keep bash commands purposeful. Prefer glob/read before broad bash usage.
- Never run destructive commands unless the user explicitly requested them.
- Do not commit unless the user explicitly asks for a commit (use bash for git operations).
- Before editing an existing file, read it first and prefer edit so unrelated content is preserved.
- In model approval mode, set requireApproval=true on bash calls that modify files, install dependencies, access the network, publish, or could be destructive.
- If a tool result says the user rejected a command, stop the current task and return a brief final answer.
- Never claim that you changed files, ran commands, or committed code unless you actually used a tool and saw a successful tool result.
- When finished, return a concise final answer in the user's language.

Use the provided tools when you need project context or local execution.

If your model/runtime cannot emit native tool calls, use this fallback protocol and return exactly one JSON object with no markdown:
Tool action:
{"type":"tool","name":"tool_name","input":{"key":"value"}}
Final answer:
{"type":"final","content":"..."}

Available fallback tools:
${JSON.stringify(fallbackTools, null, 2)}`;
}

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

export class CodekAgent {
    private client: OpenAI | null = null;
    private readonly tools: ToolDefinition[];
    private readonly openAITools: ChatCompletionTool[];
    private messages: CodekMessage[];

    constructor(private readonly config: CodekConfig) {
        this.tools = createTools(config);
        this.openAITools = toOpenAITools(this.tools);
        this.messages = [{ role: 'system', content: buildSystemPrompt(this.tools) }];
    }

    clear() {
        this.messages = [{ role: 'system', content: buildSystemPrompt(this.tools) }];
    }

    async run(input: string): Promise<string> {
        this.client ??= new OpenAI({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseURL,
        });

        this.messages.push({ role: 'user', content: input });
        const needsTool = requestLikelyNeedsTool(input);
        let successfulTool = false;

        for (let step = 1; step <= this.config.maxSteps; step++) {
            logger.step(`agent step ${step}`);

            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: this.messages,
                tools: this.openAITools,
                tool_choice: 'auto',
                temperature: 0,
            });

            const message = response.choices[0]?.message;
            const text = message?.content ?? '';
            const reasoningContent = (message as any)?.reasoning_content ?? undefined;
            logger.info(`model: ${text}`);

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

                    const result = await runTool(this.tools, fallbackAction.name, fallbackAction.input ?? {});
                    successfulTool ||= result.ok;
                    logger.tool(`${fallbackAction.name}: ${result.content}`);

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

                return text;
            }

            this.messages.push({
                role: 'assistant',
                content: text,
                reasoning_content: reasoningContent,
                tool_calls: message.tool_calls,
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
                    const result = await runTool(this.tools, call.function.name, input);
                    successfulTool ||= result.ok;
                    resultContent = JSON.stringify({
                        ok: result.ok,
                        content: result.content.slice(0, 30_000),
                    });
                    logger.tool(`${call.function.name}: ${result.content}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    resultContent = JSON.stringify({ ok: false, content: message });
                    logger.tool(`${toolName}: ${message}`);
                }

                this.messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: resultContent,
                });
            }
        }

        return `Stopped after ${this.config.maxSteps} steps without a final answer.`;
    }
}
