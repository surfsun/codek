import { mkdir, appendFile, readFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { SummaryRecord, SummaryStore } from '../types.js';

async function appendJsonLine(filePath: string, record: SummaryRecord) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}

function truncateText(value: string, maxLength: number) {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) return singleLine;
    return `${singleLine.slice(0, maxLength - 3)}...`;
}

export class JsonlSummaryStore implements SummaryStore {
    constructor(private readonly filePath: string) {}

    async list(limit = 20): Promise<SummaryRecord[]> {
        let raw = '';
        try {
            raw = await readFile(this.filePath, 'utf-8');
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }

        const records = raw
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => JSON.parse(line) as SummaryRecord)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

        return limit > 0 ? records.slice(0, limit) : records;
    }

    async add(summary: Omit<SummaryRecord, 'id' | 'createdAt'>): Promise<SummaryRecord> {
        const record: SummaryRecord = {
            id: randomUUID().slice(0, 8),
            conversationId: summary.conversationId,
            createdAt: new Date().toISOString(),
            model: summary.model,
            userRequest: truncateText(summary.userRequest, 500),
            finalAnswer: truncateText(summary.finalAnswer, 1_000),
        };

        await appendJsonLine(this.filePath, record);
        return record;
    }
}

export class NullSummaryStore implements SummaryStore {
    async list(): Promise<SummaryRecord[]> {
        return [];
    }

    async add(summary: Omit<SummaryRecord, 'id' | 'createdAt'>): Promise<SummaryRecord> {
        return {
            id: 'disabled',
            createdAt: new Date().toISOString(),
            ...summary,
        };
    }
}
