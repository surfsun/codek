import * as readline from 'readline';

const dangerousPatterns = [
    /^rm\s+/,
    /^rm$/,
    /^sudo/,
    /^dd\s+/,
    /^mkfs/,
    /^:\(\)\{.*\|\:.*\&\}/, // fork bomb
];

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

// 👇 人工确认机制（CLI交互）
export async function confirmExecution(cmd: string): Promise<boolean> {
    if (!isDangerous(cmd)) return true;

    console.log(`\n⚠️ 危险命令检测到：`);
    console.log(`👉 ${cmd}`);
    console.log(`是否允许执行？(yes/no)`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('> ', (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'yes');
        });
    });
}