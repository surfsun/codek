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

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

export async function confirmExecution(cmd: string, reason: ApprovalReason): Promise<boolean> {
    const labels: Record<ApprovalReason, string> = {
        'always-ask': 'Approval required by shell policy.',
        'model-requested': 'The model requested approval for this command.',
        'dangerous-command': 'Dangerous command detected.',
    };

    console.error(`\n${labels[reason]}`);
    console.error(cmd);
    console.error('Allow execution? Type "yes" to continue.');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('> ', (answer: string) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'yes');
        });
    });
}
