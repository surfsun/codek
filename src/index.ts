import * as readline from 'readline';
import { exec } from 'child_process';
import OpenAI from 'openai';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '你> '
});

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    baseURL: process.env['OPENAI_BASE_URL'],
});

// 👉 对话上下文
const messages = [
    {
        role: 'system',
        content: `
你是一个智能代理 codek。

你可以通过执行命令来完成任务。

你必须始终返回 JSON：

1. 执行命令：
{ "type": "command", "content": "bash命令" }

2. 最终回答：
{ "type": "text", "content": "最终答案" }

当你收到 command_result 时：
- 分析结果
- 判断是否需要继续执行命令
- 或直接输出最终答案

⚠️ 不要使用 markdown，不要使用 \`\`\`json
⚠️ 不要解释，只输出 JSON
`
    }
];

// ✅ 白名单
const allowedCommands = ['ls', 'pwd', 'whoami', 'date'];

// ❌ 危险命令
const blockedCommands = ['rm', 'sudo', 'mv', 'dd', 'mkfs'];

// ❌ 禁止符号（防止组合攻击）
const blockedPatterns = ['&&', '|', '>', '<', ';'];

function isSafeCommand(cmd: string) {
    const trimmed = cmd.trim();

    // 必须是白名单开头
    const allowed = allowedCommands.some(c => trimmed.startsWith(c));
    if (!allowed) return false;

    // 禁止危险命令
    if (blockedCommands.some(c => trimmed.includes(c))) return false;

    // 禁止组合符号
    if (blockedPatterns.some(p => trimmed.includes(p))) return false;

    return true;
}

// 👉 提取 JSON
function extractJSON(text: string) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) return match[1];

    // fallback：抓第一个 {}
    const match2 = text.match(/\{[\s\S]*\}/);
    if (match2) return match2[0];

    return text;
}

// 👉 执行命令
function runCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout || stderr);
            }
        });
    });
}

// 🚀 Agent 核心循环
async function runAgent(userInput: string) {
    messages.push({ role: 'user', content: userInput });

    let steps = 0;
    const MAX_STEPS = 5; // ✅ 限制执行次数

    while (true) {
        if (steps++ > MAX_STEPS) {
            console.log('⚠️ 超过最大执行步数，强制停止');
            break;
        }

        const completion = await client.chat.completions.create({
            model: 'google/gemma-4-e4b',
            messages,
        });

        const reply = completion.choices[0].message.content;
        const clean = extractJSON(reply);

        let parsed;
        try {
            parsed = JSON.parse(clean);
        } catch {
            console.log('AI>', reply);
            break;
        }

        // ✅ 最终回答
        if (parsed.type === 'text') {
            console.log('AI>', parsed.content);

            messages.push({
                role: 'assistant',
                content: parsed.content
            });

            break;
        }

        // ✅ 执行命令
        if (parsed.type === 'command') {
            const cmd = parsed.content;

            console.log('⚡ 执行:', cmd);

            if (!isSafeCommand(cmd)) {
                console.log('❌ 命令被拒绝（不安全）');

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify({
                        type: 'command_result',
                        content: '命令被拒绝（不安全）'
                    })
                });

                continue;
            }

            try {
                const result = await runCommand(cmd);

                console.log('📦 结果:\n', result);

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify({
                        type: 'command_result',
                        content: result
                    })
                });

                continue; // 👉 继续思考

            } catch (err) {
                const errorMsg = String(err);

                console.log('❌ 执行失败:', errorMsg);

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify({
                        type: 'command_result',
                        content: errorMsg
                    })
                });

                continue;
            }
        }
    }
}

// CLI 入口
console.log('开始聊天（输入 exit 退出）');
rl.prompt();

rl.on('line', async (input) => {
    const text = input.trim();

    if (text === 'exit') {
        rl.close();
        return;
    }

    try {
        await runAgent(text);
    } catch (err) {
        console.error('出错:', err);
    }

    rl.prompt();
});

rl.on('close', () => {
    console.log('聊天结束 👋');
    process.exit(0);
});