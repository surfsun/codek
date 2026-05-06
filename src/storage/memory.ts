import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { MemoryRecord, MemoryScope, MemoryStore } from '../types.js';

type MemoryFile = {
    version: 1;
    memories: MemoryRecord[];
};

function emptyMemoryFile(): MemoryFile {
    return {
        version: 1,
        memories: [],
    };
}

export class JsonMemoryStore implements MemoryStore {
    constructor(private readonly filePath: string) {}

    async list(): Promise<MemoryRecord[]> {
        const file = await this.readFile();
        return [...file.memories].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }

    async add(content: string, scope: MemoryScope = 'project'): Promise<MemoryRecord> {
        const trimmed = content.trim();
        if (!trimmed) {
            throw new Error('Memory content cannot be empty.');
        }

        const file = await this.readFile();
        const now = new Date().toISOString();
        const record: MemoryRecord = {
            id: randomUUID().slice(0, 8),
            scope,
            content: trimmed,
            createdAt: now,
            updatedAt: now,
        };

        file.memories.push(record);
        await this.writeFile(file);
        return record;
    }

    async remove(id: string): Promise<boolean> {
        const file = await this.readFile();
        const next = file.memories.filter(memory => memory.id !== id);
        if (next.length === file.memories.length) return false;

        await this.writeFile({ ...file, memories: next });
        return true;
    }

    private async readFile(): Promise<MemoryFile> {
        try {
            const raw = await readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw) as MemoryFile;
            if (parsed.version !== 1 || !Array.isArray(parsed.memories)) {
                throw new Error('Unsupported memory file format.');
            }
            return parsed;
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                return emptyMemoryFile();
            }
            throw error;
        }
    }

    private async writeFile(file: MemoryFile) {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmpPath, `${JSON.stringify(file, null, 2)}\n`, 'utf-8');
        await rename(tmpPath, this.filePath);
    }
}

export class NullMemoryStore implements MemoryStore {
    async list(): Promise<MemoryRecord[]> {
        return [];
    }

    async add(): Promise<MemoryRecord> {
        throw new Error('Memory is disabled.');
    }

    async remove(): Promise<boolean> {
        return false;
    }
}
