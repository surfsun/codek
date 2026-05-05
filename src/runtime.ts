import { CodekConfig } from './config.js';
import { ToolDefinition, ToolResult } from './types.js';
import { runShell } from './tools/shell.js';
import { editFile, readFile, writeFile } from './tools/file.js';
import { globFiles } from './tools/glob.js';
import { grepFiles } from './tools/grep.js';
import { askQuestion } from './tools/question.js';
import { createTask, getTask, listTasks, updateTask, stopTask } from './tools/task.js';

function asString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`Expected string input: ${key}`);
  return value;
}

function optionalString(input: Record<string, unknown>, key: string, fallback: string): string {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`Expected string input: ${key}`);
  return value;
}

function optionalNumber(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number') throw new Error(`Expected number input: ${key}`);
  return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`Expected boolean input: ${key}`);
  return value;
}

export function createTools(config: CodekConfig): ToolDefinition[] {
  return [
    {
      name: 'read',
      description: 'Read the contents of a UTF-8 text file inside the project.',
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
      name: 'edit',
      description: 'Edit an existing UTF-8 text file by replacing one exact, unique text block. Prefer this over write for changes to existing files.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project-relative file path.' },
          search: { type: 'string', description: 'Exact existing text block to replace. Must be unique in the file.' },
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
      name: 'write',
      description: 'Create a new file or overwrite an existing file. Prefer edit for modifying existing files.',
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
      name: 'bash',
      description: 'Run a shell command in the project. Working directory is the project root. In model approval mode, set requireApproval to true for commands that modify files, install dependencies, access the network, or could be destructive.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
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
      name: 'glob',
      description: 'Find files matching a glob pattern. Supports ** (any depth), * (within one directory), ? (single char), and {a,b} (alternation). Examples: **/*.ts, src/**/*.ts, *.json, lib/*.{ts,js}.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to search for.' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
      async run(input) {
        const content = await globFiles(config.cwd, asString(input, 'pattern'));
        return { ok: true, content };
      },
    },
    {
      name: 'grep',
      description: 'Search file contents using a regular expression. Returns file:line:content matches. Skips node_modules, .git, dist, binary files, and hidden files.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression pattern to search for.' },
          path: { type: 'string', description: 'Project-relative directory to search in. Defaults to root.' },
          include: { type: 'string', description: 'File filter glob (e.g., *.ts, .ts, *.{ts,js}).' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
      async run(input) {
        const content = await grepFiles(
          config.cwd,
          asString(input, 'pattern'),
          optionalString(input, 'path', ''),
          optionalString(input, 'include', ''),
        );
        return { ok: true, content };
      },
    },
    {
      name: 'ask_user_question',
      description: 'Ask the user a multi-choice question and return their answer. Use when you need user input to decide between approaches.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question to ask the user.' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Short option label.' },
                description: { type: 'string', description: 'Optional explanation of this option.' },
              },
              required: ['label'],
              additionalProperties: false,
            },
            description: 'List of choices to present.',
          },
          multiSelect: { type: 'boolean', description: 'Allow multiple selections from the list.' },
        },
        required: ['question', 'options'],
        additionalProperties: false,
      },
      async run(input) {
        const options = (input.options as Array<{ label: string; description?: string }>) || [];
        const content = await askQuestion(
          asString(input, 'question'),
          options,
          optionalBoolean(input, 'multiSelect', false),
        );
        return { ok: true, content };
      },
    },
    {
      name: 'task_create',
      description: 'Create a new task to track work. Returns the task ID. Use this to break down complex work into steps.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Short task title in imperative form (e.g., "Fix login bug").' },
          description: { type: 'string', description: 'Optional task details.' },
        },
        required: ['subject'],
        additionalProperties: false,
      },
      async run(input) {
        const id = createTask(asString(input, 'subject'), optionalString(input, 'description', ''));
        return { ok: true, content: `Created task ${id}: ${input.subject}` };
      },
    },
    {
      name: 'task_get',
      description: 'Get details of a specific task by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      async run(input) {
        const content = getTask(asString(input, 'id'));
        return { ok: true, content };
      },
    },
    {
      name: 'task_list',
      description: 'List all active tasks and their statuses.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      async run(_input) {
        const content = listTasks();
        return { ok: true, content };
      },
    },
    {
      name: 'task_update',
      description: 'Update a task status or details.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID.' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'], description: 'New task status.' },
          subject: { type: 'string', description: 'New task subject.' },
          description: { type: 'string', description: 'New task description.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      async run(input) {
        const content = updateTask(asString(input, 'id'), {
          subject: input.subject as string | undefined,
          description: input.description as string | undefined,
          status: input.status as string | undefined,
        });
        return { ok: true, content };
      },
    },
    {
      name: 'task_stop',
      description: 'Stop and remove a task from the active list.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      async run(input) {
        const content = stopTask(asString(input, 'id'));
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
