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
    | 'thinking'
    | 'calling_model'
    | 'running_tool'
    | 'done'
    | 'error';

export type AgentEvent =
    | { type: 'status'; status: AgentStatus; message?: string }
    | { type: 'step'; step: number; maxSteps: number }
    | { type: 'tool_start'; name: string }
    | { type: 'tool_end'; name: string; ok: boolean }
    | { type: 'model'; content: string }
    | { type: 'error'; message: string };

export type AgentAction =
    | { type: 'tool'; name: string; input?: Record<string, unknown> }
    | { type: 'final'; content: string };

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
