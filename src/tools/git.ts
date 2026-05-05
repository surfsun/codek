import { ShellApprovalMode } from '../config.js';
import { runShell } from './shell.js';

export async function commit(cwd: string, message: string, approvalMode: ShellApprovalMode) {
    const status = await runShell('git status --short', { cwd, approvalMode: 'allow' });
    if (status === '(no output)') {
        return 'No changes to commit.';
    }

    await runShell('git add .', {
        cwd,
        approvalMode,
        modelRequiresApproval: true,
    });

    return runShell(`git commit -m ${JSON.stringify(message)}`, {
        cwd,
        approvalMode,
        modelRequiresApproval: true,
    });
}
