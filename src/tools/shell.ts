import { exec } from 'child_process';
import { confirmExecution } from '../security/guard.js';

export type ShellOptions = {
    cwd: string;
    autoApprove: boolean;
    timeoutMs?: number;
};

export async function runShell(cmd: string, options: ShellOptions): Promise<string> {
    const ok = await confirmExecution(cmd, options.autoApprove);

    if (!ok) {
        return 'Command rejected by user.';
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
