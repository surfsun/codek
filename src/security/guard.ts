import * as readline from 'readline';

const dangerousPatterns = [
    /^rm\s+(-[^\s]*[rf][^\s]*\s+)?(\/|\.)/,
    /^sudo/,
    /^dd\s+/,
    /^mkfs/,
    /^chmod\s+(-R\s+)?777/,
    /^chown\s+(-R\s+)?/,
    /\b>\s*\/dev\/sd[a-z]/,
    /^:\(\)\{.*\|\:.*\&\}/, // fork bomb
];

export type ApprovalReason = 'always-ask' | 'model-requested' | 'dangerous-command';
export type ApprovalDecision = 'allow-once' | 'allow-session' | 'reject';

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

export async function confirmExecution(cmd: string, reason: ApprovalReason): Promise<ApprovalDecision> {
    const labels: Record<ApprovalReason, string> = {
        'always-ask': 'Approval required by shell policy.',
        'model-requested': 'The model requested approval for this command.',
        'dangerous-command': 'Dangerous command detected.',
    };

    console.error(`\n${labels[reason]}`);
    console.error(cmd);
    console.error('Choose an action:');
    console.error('  1. Execute once');
    console.error('  2. Always execute this exact command for the current session');
    console.error('  3. Do not execute and stop the current task');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('> ', (answer: string) => {
            rl.close();
            const choice = answer.trim();

            if (choice === '1') {
                resolve('allow-once');
                return;
            }

            if (choice === '2') {
                resolve('allow-session');
                return;
            }

            resolve('reject');
        });
    });
}
