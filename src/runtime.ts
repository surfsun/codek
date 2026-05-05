import { CodekConfig } from './config.js';
import { ToolDefinition, ToolResult } from './types.js';
import { runShell } from './tools/shell.js';
import { editFile, listFiles, readFile, writeFile } from './tools/file.js';
import { commit } from './tools/git.js';

function asString(input: Record<string, unknown>, key: string) {
    const value = input[key];
    if (typeof value !== 'string') {
        throw new Error(`Expected string input: ${key}`);
    }
    return value;
}

function optionalString(input: Record<string, unknown>, key: string, fallback: string) {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string') {
        throw new Error(`Expected string input: ${key}`);
    }
    return value;
}

function optionalNumber(input: Record<string, unknown>, key: string, fallback: number) {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'number') {
        throw new Error(`Expected number input: ${key}`);
    }
    return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string, fallback: boolean) {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
        throw new Error(`Expected boolean input: ${key}`);
    }
    return value;
}

export function createTools(config: CodekConfig): ToolDefinition[] {
    return [
        {
            name: 'list_files',
            description: 'List files under a project path. Skips node_modules, .git, and dist.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Project-relative path. Defaults to .' },
                    depth: { type: 'number', description: 'Maximum directory depth. Defaults to 2.' },
                },
                additionalProperties: false,
            },
            async run(input) {
                const content = await listFiles(
                    config.cwd,
                    optionalString(input, 'path', '.'),
                    optionalNumber(input, 'depth', 2),
                );
                return { ok: true, content };
            },
        },
        {
            name: 'read_file',
            description: 'Read a UTF-8 text file inside the current project.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Project-relative file path.' },
                },
                required: ['path'],
                additionalProperties: false,
            },
            async run(input) {
                const content = await readFile(config.cwd, asString(input, 'path'));
                return { ok: true, content };
            },
        },
        {
            name: 'edit_file',
            description: 'Edit an existing UTF-8 text file by replacing one exact, unique text block. Prefer this over write_file for changes to existing files.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Project-relative file path.' },
                    search: { type: 'string', description: 'Exact existing text block to replace. Must be unique.' },
                    replace: { type: 'string', description: 'Replacement text.' },
                },
                required: ['path', 'search', 'replace'],
                additionalProperties: false,
            },
            async run(input) {
                const content = await editFile(
                    config.cwd,
                    asString(input, 'path'),
                    asString(input, 'search'),
                    asString(input, 'replace'),
                );
                return { ok: true, content };
            },
        },
        {
            name: 'write_file',
            description: 'Write a complete UTF-8 text file inside the current project. Prefer edit_file for existing files; use this for new files or deliberate full rewrites.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Project-relative file path.' },
                    content: { type: 'string', description: 'Complete UTF-8 file content.' },
                },
                required: ['path', 'content'],
                additionalProperties: false,
            },
            async run(input) {
                const content = await writeFile(config.cwd, asString(input, 'path'), asString(input, 'content'));
                return { ok: true, content };
            },
        },
        {
            name: 'shell',
            description: 'Run a shell command in the current project. In model approval mode, set requireApproval to true for commands that modify files, install dependencies, access the network, publish, commit, or could be destructive.',
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Shell command to run in the current project.' },
                    requireApproval: { type: 'boolean', description: 'Whether the command should ask the user before running in model approval mode.' },
                },
                required: ['command'],
                additionalProperties: false,
            },
            async run(input) {
                const content = await runShell(asString(input, 'command'), {
                    cwd: config.cwd,
                    approvalMode: config.shellApprovalMode,
                    modelRequiresApproval: optionalBoolean(input, 'requireApproval', false),
                });
                return { ok: true, content };
            },
        },
        {
            name: 'git_commit',
            description: 'Create a git commit from current changes. Use only when the user explicitly asks for a commit.',
            inputSchema: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Commit message.' },
                },
                required: ['message'],
                additionalProperties: false,
            },
            async run(input) {
                const content = await commit(config.cwd, asString(input, 'message'), config.shellApprovalMode);
                return { ok: true, content };
            },
        },
    ];
}

export async function runTool(tools: ToolDefinition[], name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
    const tool = tools.find(candidate => candidate.name === name);

    if (!tool) {
        return { ok: false, content: `Unknown tool: ${name}` };
    }

    try {
        return await tool.run(input);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, content: message };
    }
}
