import { exec } from 'child_process';
import { ShellApprovalMode } from '../config.js';
import { confirmExecution, isDangerous } from '../security/guard.js';

const sessionApprovedCommands = new Set<string>();

export type ShellOptions = {
    cwd: string;
    approvalMode: ShellApprovalMode;
    modelRequiresApproval?: boolean;
    timeoutMs?: number;
};

export async function runShell(cmd: string, options: ShellOptions): Promise<string> {
    const dangerous = isDangerous(cmd);
    let needsApproval = false;
    let reason: Parameters<typeof confirmExecution>[1] = 'always-ask';

    if (options.approvalMode === 'ask') {
        needsApproval = true;
        reason = dangerous ? 'dangerous-command' : 'always-ask';
    } else if (options.approvalMode === 'model') {
        needsApproval = dangerous || options.modelRequiresApproval === true;
        reason = dangerous ? 'dangerous-command' : 'model-requested';
    }

    if (needsApproval && sessionApprovedCommands.has(cmd)) {
        needsApproval = false;
    }

    if (needsApproval) {
        const decision = await confirmExecution(cmd, reason);

        if (decision === 'reject') {
            return 'Command rejected by user. Stop the current task and return a brief final answer.';
        }

        if (decision === 'allow-session') {
            sessionApprovedCommands.add(cmd);
        }
    }

    return new Promise((resolve) => {
        exec(cmd, {
            cwd: options.cwd,
            timeout: options.timeoutMs ?? 120_000,
            maxBuffer: 1024 * 1024,
        }, (err, stdout, stderr) => {
            const output = `${stdout || ''}${stderr || ''}`.trim();
            if (err) {
                resolve(output || `Command failed: ${err.message}`);
                return;
            }
            resolve(output || '(no output)');
        });
    });
}
