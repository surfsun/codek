import { runShell } from './shell';

export async function commit(message: string) {
    await runShell('git add .');
    return await runShell(`git commit -m "${message}"`);
}