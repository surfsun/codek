import OpenAI from 'openai';
import { runTool } from './runtime';
import { logger } from './logger';

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const messages: any[] = [
    {
        role: 'system',
        content: `
你是 codek CLI Agent。

你必须返回 JSON：

{ "type": "tool", "name": "...", "input": {...} }
或
{ "type": "final", "content": "..." }

禁止重复执行同一命令
必须逐步执行
`
    }
];

export async function runAgent(input: string) {
    messages.push({ role: 'user', content: input });

    for (let step = 0; step < 20; step++) {

        logger.step(`Agent step ${step}`);

        const res = await client.chat.completions.create({
            model: 'google/gemma-4-e4b',
            messages,
            temperature: 0,
        });

        const text = res.choices[0].message.content;
        logger.info(`LLM: ${text}`);

        let action;
        try {
            action = JSON.parse(text!);
        } catch {
            logger.error('JSON parse failed');
            continue;
        }

        if (action.type === 'final') {
            logger.info(`FINAL: ${action.content}`);
            return;
        }

        if (action.type === 'tool') {
            logger.tool(`Executing tool: ${action.name}`);

            const result = await runTool(action.name, action.input);

            logger.tool(`Result: ${result}`);

            messages.push({
                role: 'user',
                content: JSON.stringify({
                    type: 'tool_result',
                    content: result
                })
            });
        }
    }

    logger.warn('Max steps reached');
}