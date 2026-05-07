export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export type Task = {
    id: string;
    subject: string;
    description: string;
    status: TaskStatus;
    createdAt: number;
};

export type ToolResult = {
    ok: boolean;
    content: string;
};

export type AgentStatus =
    | 'idle'
    | 'building_context'
    | 'archiving'
    | 'summarizing'
    | 'thinking'
    | 'calling_model'
    | 'running_tool'
    | 'done'
    | 'error';

export type AgentEvent =
    | { type: 'status'; status: AgentStatus; message?: string }
    | { type: 'step'; step: number; maxSteps: number }
    | { type: 'tool_start'; name: string; inputSummary?: string }
    | { type: 'tool_end'; name: string; ok: boolean; durationMs?: number }
    | { type: 'assistant_delta'; content: string }
    | { type: 'llm_request'; step: number; model: string; messages: Array<{ role: string; name?: string; content: string; toolCalls?: string[] }>; tools: string[] }
    | { type: 'llm_response_start'; step: number }
    | { type: 'llm_response_delta'; kind: 'reasoning' | 'content' | 'tool_call'; content: string }
    | { type: 'llm_response_complete'; step: number; contentLength: number; reasoningLength: number; toolCalls: string[] }
    | { type: 'model'; content: string }
    | { type: 'error'; message: string };

export type AgentAction =
    | { type: 'tool'; name: string; input?: Record<string, unknown> }
    | { type: 'final'; content: string };

export type ArchiveMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ConversationArchive = {
    startConversation(meta: {
        cwd: string;
        model: string;
        baseURL: string;
    }): Promise<string>;
    appendMessage(conversationId: string, message: {
        role: ArchiveMessageRole;
        content: string;
        name?: string;
        ok?: boolean;
        metadata?: Record<string, unknown>;
    }): Promise<void>;
    appendEvent(conversationId: string, event: {
        type: string;
        content?: string;
        metadata?: Record<string, unknown>;
    }): Promise<void>;
};

export type MemoryScope = 'project' | 'global';

export type MemoryRecord = {
    id: string;
    scope: MemoryScope;
    content: string;
    createdAt: string;
    updatedAt: string;
};

export type MemoryStore = {
    list(): Promise<MemoryRecord[]>;
    add(content: string, scope?: MemoryScope): Promise<MemoryRecord>;
    remove(id: string): Promise<boolean>;
};

export type SummaryRecord = {
    id: string;
    conversationId: string;
    createdAt: string;
    model: string;
    userRequest: string;
    finalAnswer: string;
};

export type SummaryStore = {
    list(limit?: number): Promise<SummaryRecord[]>;
    add(summary: Omit<SummaryRecord, 'id' | 'createdAt'>): Promise<SummaryRecord>;
};

export type ToolInputSchema = {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
};

export type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    run(input: Record<string, unknown>): Promise<ToolResult>;
};
