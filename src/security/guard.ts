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

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

export async function confirmExecution(cmd: string, autoApprove = false): Promise<boolean> {
    if (autoApprove) return true;
    if (!isDangerous(cmd)) return true;

    console.error('\nDangerous command detected:');
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
