import { runShell } from './shell.js';

export async function commit(cwd: string, message: string, autoApprove: boolean) {
    await runShell('git add .', { cwd, autoApprove });
    return runShell(`git commit -m ${JSON.stringify(message)}`, { cwd, autoApprove });
}
