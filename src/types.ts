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
