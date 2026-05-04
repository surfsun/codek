export type Role = 'system' | 'user' | 'assistant';

export type ChatMessage = {
    role: Role;
    content: string;
};

export type AgentAction =
    | { type: 'tool'; name: string; input?: Record<string, unknown> }
    | { type: 'final'; content: string };

export type ToolResult = {
    ok: boolean;
    content: string;
};

export type ToolDefinition = {
    name: string;
    description: string;
    inputSchema: Record<string, string>;
    run(input: Record<string, unknown>): Promise<ToolResult>;
};
