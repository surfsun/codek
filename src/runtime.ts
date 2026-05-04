import { runShell } from './tools/shell';
import { readFile, writeFile } from './tools/file';
import { commit } from './tools/git';

export async function runTool(name: string, input: any) {
    switch (name) {
        case 'shell':
            return runShell(input.command);

        case 'read_file':
            return readFile(input.path);

        case 'write_file':
            return writeFile(input.path, input.content);

        case 'git_commit':
            return commit(input.message);

        default:
            return `Unknown tool: ${name}`;
    }
}