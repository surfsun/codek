import OpenAI from 'openai';
import { CodekConfig } from './config.js';
import { logger } from './logger.js';
import { createTools, runTool } from './runtime.js';
import { AgentAction, ChatMessage, ToolDefinition } from './types.js';

function buildSystemPrompt(tools: ToolDefinition[]) {
    const toolList = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
    }));

    return `You are codek, a terminal coding agent.

Work like Codex or Claude Code in a local project:
- Inspect the repository before changing code.
- Prefer small, focused edits that solve the user request.
- Use tools one step at a time and wait for each result.
- Keep shell commands purposeful. Prefer list_files/read_file before broad shell usage.
- Never run destructive commands unless the user explicitly requested them.
- Do not commit unless the user explicitly asks for a commit.
- When finished, return a concise final answer in the user's language.

You must respond with exactly one JSON object and no markdown.

Tool action:
{"type":"tool","name":"tool_name","input":{"key":"value"}}

Final answer:
{"type":"final","content":"..."}

Available tools:
${JSON.stringify(toolList, null, 2)}`;
}

function parseAction(text: string | null): AgentAction | null {
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

export class CodekAgent {
    private client: OpenAI | null = null;
    private readonly tools: ToolDefinition[];
    private messages: ChatMessage[];

    constructor(private readonly config: CodekConfig) {
        this.tools = createTools(config);
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
                temperature: 0,
            });

            const text = response.choices[0]?.message?.content ?? '';
            logger.info(`model: ${text}`);

            const action = parseAction(text);
            this.messages.push({ role: 'assistant', content: text });

            if (!action) {
                this.messages.push({
                    role: 'user',
                    content: 'Your previous response was not valid JSON. Return exactly one valid JSON object.',
                });
                continue;
            }

            if (action.type === 'final') {
                return action.content;
            }

            const result = await runTool(this.tools, action.name, action.input ?? {});
            logger.tool(`${action.name}: ${result.content}`);

            this.messages.push({
                role: 'user',
                content: JSON.stringify({
                    type: 'tool_result',
                    tool: action.name,
                    ok: result.ok,
                    content: result.content.slice(0, 30_000),
                }),
            });
        }

        return `Stopped after ${this.config.maxSteps} steps without a final answer.`;
    }
}
