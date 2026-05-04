import { CodekConfig } from './config.js';
import { ToolDefinition, ToolResult } from './types.js';
import { runShell } from './tools/shell.js';
import { listFiles, readFile, writeFile } from './tools/file.js';
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

export function createTools(config: CodekConfig): ToolDefinition[] {
    return [
        {
            name: 'list_files',
            description: 'List files under a project path. Skips node_modules, .git, and dist.',
            inputSchema: { path: 'string optional, defaults to .', depth: 'number optional, defaults to 2' },
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
            inputSchema: { path: 'string required' },
            async run(input) {
                const content = await readFile(config.cwd, asString(input, 'path'));
                return { ok: true, content };
            },
        },
        {
            name: 'write_file',
            description: 'Write a complete UTF-8 text file inside the current project.',
            inputSchema: { path: 'string required', content: 'string required' },
            async run(input) {
                const content = await writeFile(config.cwd, asString(input, 'path'), asString(input, 'content'));
                return { ok: true, content };
            },
        },
        {
            name: 'shell',
            description: 'Run a shell command in the current project. Dangerous commands require approval unless --yes is set.',
            inputSchema: { command: 'string required' },
            async run(input) {
                const content = await runShell(asString(input, 'command'), {
                    cwd: config.cwd,
                    autoApprove: config.autoApprove,
                });
                return { ok: true, content };
            },
        },
        {
            name: 'git_commit',
            description: 'Create a git commit from all current changes.',
            inputSchema: { message: 'string required' },
            async run(input) {
                const content = await commit(config.cwd, asString(input, 'message'), config.autoApprove);
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
