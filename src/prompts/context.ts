import type { ChatCompletionSystemMessageParam } from 'openai/resources/chat/completions';
import { MemoryRecord, ToolDefinition } from '../types.js';
import { buildSystemPrompt } from './system.js';

function buildMemoryPrompt(memories: MemoryRecord[]) {
    if (memories.length === 0) return '';

    const lines = memories.map(memory => `- [${memory.scope}:${memory.id}] ${memory.content}`);
    return [
        'Known durable memories for this project/user:',
        ...lines,
        '',
        'Use these memories only when they are relevant. Do not expose memory IDs unless the user asks about memory management.',
    ].join('\n');
}

export function buildInitialMessages(
    tools: ToolDefinition[],
    memories: MemoryRecord[] = [],
): ChatCompletionSystemMessageParam[] {
    const memoryPrompt = buildMemoryPrompt(memories);
    const content = memoryPrompt
        ? `${buildSystemPrompt(tools)}\n\n${memoryPrompt}`
        : buildSystemPrompt(tools);

    return [
        {
            role: 'system',
            content,
        },
    ];
}
