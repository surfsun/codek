import { existsSync, readFileSync } from 'fs';
import { stdout as output } from 'process';
import type { Interface } from 'readline/promises';

type LlmLogRecord = {
    time?: string;
    type?: string;
    model?: string;
    messages?: Array<{ role?: string; content?: unknown; name?: string; tool_calls?: Array<{ function?: { name?: string } }> }>;
    content?: string;
    reasoning_content?: string;
    tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
};

type LlmViewEntry = {
    time: string;
    title: string;
    body: string;
};

function stringifyContent(content: unknown) {
    if (typeof content === 'string') return content;
    if (content === null || content === undefined) return '';
    return JSON.stringify(content);
}

function trimForList(content: string, maxLength = 2_400) {
    if (content.length <= maxLength) return content;
    return `${content.slice(0, maxLength)}\n... (${content.length - maxLength} chars hidden)`;
}

function parseJsonLines(filePath: string): LlmLogRecord[] {
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];

    const records: LlmLogRecord[] = [];
    for (const line of content.split(/\r?\n/)) {
        try {
            records.push(JSON.parse(line) as LlmLogRecord);
        } catch {
            // Ignore incomplete or corrupt log lines.
        }
    }
    return records;
}

function requestEntry(record: LlmLogRecord, index: number): LlmViewEntry {
    const messages = record.messages ?? [];
    const lines = [
        `model: ${record.model ?? 'unknown'}`,
        `messages: ${messages.length}`,
        '',
    ];

    messages.forEach((message, messageIndex) => {
        const name = message.name ? ` name=${message.name}` : '';
        lines.push(`--- message ${messageIndex + 1} ${message.role ?? 'unknown'}${name} ---`);
        lines.push(trimForList(stringifyContent(message.content), 1_400) || '(empty)');
        if (message.tool_calls?.length) {
            const tools = message.tool_calls.map(call => call.function?.name || 'tool_call').join(', ');
            lines.push(`tool calls: ${tools}`);
        }
        lines.push('');
    });

    return {
        time: record.time ?? '',
        title: `request #${index}`,
        body: lines.join('\n').trimEnd(),
    };
}

function responseEntry(record: LlmLogRecord, index: number): LlmViewEntry {
    const lines: string[] = [];
    if (record.reasoning_content) {
        lines.push('--- reasoning ---');
        lines.push(trimForList(record.reasoning_content));
        lines.push('');
    }

    lines.push('--- content ---');
    lines.push(trimForList(record.content ?? '') || '(empty)');

    if (record.tool_calls?.length) {
        lines.push('');
        lines.push('--- tool calls ---');
        record.tool_calls.forEach(call => {
            lines.push(`${call.function?.name || call.id || 'tool_call'} ${call.function?.arguments ?? ''}`.trim());
        });
    }

    return {
        time: record.time ?? '',
        title: `response #${index}`,
        body: lines.join('\n').trimEnd(),
    };
}

function buildEntries(records: LlmLogRecord[]) {
    let requestCount = 0;
    let responseCount = 0;
    const entries: LlmViewEntry[] = [];

    for (const record of records) {
        if (record.type === 'request') {
            requestCount++;
            entries.push(requestEntry(record, requestCount));
        }
        if (record.type === 'response_complete') {
            responseCount++;
            entries.push(responseEntry(record, responseCount));
        }
    }

    return entries.reverse();
}

function printEntry(entry: LlmViewEntry, index: number, total: number) {
    output.write(`\n[${index + 1}/${total}] ${entry.title}${entry.time ? `  ${entry.time}` : ''}\n`);
    output.write(`${entry.body}\n`);
}

export async function viewLlmLog(filePath: string, rl: Interface) {
    const entries = buildEntries(parseJsonLines(filePath));
    if (entries.length === 0) {
        output.write(filePath ? `No LLM records yet: ${filePath}\n` : 'No LLM log file is active.\n');
        return;
    }

    output.write(`LLM records: ${entries.length}\n`);
    output.write('Enter: next page, one: one-by-one, exit: quit\n');

    let index = 0;
    let pageSize = 2;

    while (index < entries.length) {
        const end = Math.min(index + pageSize, entries.length);
        for (; index < end; index++) {
            printEntry(entries[index], index, entries.length);
        }

        if (index >= entries.length) {
            output.write('\nEnd of LLM records.\n');
            return;
        }

        const answer = (await rl.question('\nllm> ')).trim().toLowerCase();
        if (answer === 'exit' || answer === 'quit' || answer === 'q') return;
        if (answer === 'one' || answer === '1') {
            pageSize = 1;
            continue;
        }
        if (answer === 'page' || answer === '2') {
            pageSize = 2;
        }
    }
}
