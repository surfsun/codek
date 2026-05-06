import type { ChatCompletionSystemMessageParam } from 'openai/resources/chat/completions';
import { ToolDefinition } from '../types.js';
import { buildSystemPrompt } from './system.js';

export function buildInitialMessages(tools: ToolDefinition[]): ChatCompletionSystemMessageParam[] {
    return [
        {
            role: 'system',
            content: buildSystemPrompt(tools),
        },
    ];
}
