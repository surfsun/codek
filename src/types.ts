export type ToolResult = {
    ok: boolean;
    content: string;
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
