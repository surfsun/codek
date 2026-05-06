import { mkdir, appendFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { ConversationArchive } from '../types.js';

type ArchiveRecord =
    | {
        kind: 'conversation_start';
        conversationId: string;
        createdAt: string;
        cwd: string;
        model: string;
        baseURL: string;
    }
    | {
        kind: 'message';
        conversationId: string;
        createdAt: string;
        role: string;
        content: string;
        name?: string;
        ok?: boolean;
        metadata?: Record<string, unknown>;
    }
    | {
        kind: 'event';
        conversationId: string;
        createdAt: string;
        type: string;
        content?: string;
        metadata?: Record<string, unknown>;
    };

async function appendJsonLine(filePath: string, record: ArchiveRecord) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}

export class JsonlConversationArchive implements ConversationArchive {
    constructor(private readonly filePath: string) {}

    async startConversation(meta: {
        cwd: string;
        model: string;
        baseURL: string;
    }): Promise<string> {
        const conversationId = randomUUID();
        await appendJsonLine(this.filePath, {
            kind: 'conversation_start',
            conversationId,
            createdAt: new Date().toISOString(),
            cwd: meta.cwd,
            model: meta.model,
            baseURL: meta.baseURL,
        });
        return conversationId;
    }

    async appendMessage(conversationId: string, message: {
        role: string;
        content: string;
        name?: string;
        ok?: boolean;
        metadata?: Record<string, unknown>;
    }) {
        await appendJsonLine(this.filePath, {
            kind: 'message',
            conversationId,
            createdAt: new Date().toISOString(),
            role: message.role,
            content: message.content,
            name: message.name,
            ok: message.ok,
            metadata: message.metadata,
        });
    }

    async appendEvent(conversationId: string, event: {
        type: string;
        content?: string;
        metadata?: Record<string, unknown>;
    }) {
        await appendJsonLine(this.filePath, {
            kind: 'event',
            conversationId,
            createdAt: new Date().toISOString(),
            type: event.type,
            content: event.content,
            metadata: event.metadata,
        });
    }
}

export class NullConversationArchive implements ConversationArchive {
    async startConversation(): Promise<string> {
        return 'disabled';
    }

    async appendMessage() {}

    async appendEvent() {}
}
