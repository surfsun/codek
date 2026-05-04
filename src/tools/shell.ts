import { exec } from 'child_process';
import { isDangerous } from '../security/guard';

export async function runShell(cmd: string): Promise<string> {

    const ok = await isDangerous(cmd);

    if (!ok) {
        return '❌ 用户拒绝执行危险命令';
    }

    return new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
            resolve((stdout || '') + (stderr || ''));
        });
    });
}