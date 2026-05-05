import OpenAI from 'openai';
import type {
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageParam,
    ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { CodekConfig } from './config.js';
import { logger } from './logger.js';
import { createTools, runTool } from './runtime.js';
import { ToolDefinition } from './types.js';

function buildSystemPrompt(tools: ToolDefinition[]) {
    return `You are codek, a terminal coding agent.

Work like Codex or Claude Code in a local project:
- Inspect the repository before changing code.
- Prefer small, focused edits that solve the user request.
- Use tools one step at a time and wait for each result.
- Keep shell commands purposeful. Prefer list_files/read_file before broad shell usage.
- Never run destructive commands unless the user explicitly requested them.
- Do not commit unless the user explicitly asks for a commit.
- Before editing an existing file, read it first and prefer edit_file so unrelated content is preserved.
- In shell model approval mode, set requireApproval=true for commands that modify files, install dependencies, access the network, publish, commit, or could be destructive.
- When finished, return a concise final answer in the user's language.

Use the provided tools when you need project context or local execution.`;
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

export class CodekAgent {
    private client: OpenAI | null = null;
    private readonly tools: ToolDefinition[];
    private readonly openAITools: ChatCompletionTool[];
    private messages: ChatCompletionMessageParam[];

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
            logger.info(`model: ${text}`);

            if (!message) {
                this.messages.push({
                    role: 'user',
                    content: 'The previous response was empty. Continue with a final answer or a tool call.',
                });
                continue;
            }

            if (!message.tool_calls?.length) {
                return text;
            }

            this.messages.push({
                role: 'assistant',
                content: text,
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
