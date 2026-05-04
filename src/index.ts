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

// 对话上下文
const messages = [
    {
        role: 'system',
        content: `
你是一个智能代理 codek，可以执行 shell 和 git 命令完成任务。

你必须始终返回 JSON：

1. 执行命令：
{ "type": "command", "content": "命令" }

2. 最终回答：
{ "type": "text", "content": "最终结果" }

标准 git 提交流程：
1. git status
2. git diff
3. git add .
4. git commit -m "message"

当你收到 command_result：
- 分析结果
- 判断是否继续执行
- 或输出最终答案

⚠️ 不要 markdown
⚠️ 不要解释
⚠️ 只输出 JSON
`
    }
];

// ✅ 允许命令
const allowedBaseCommands = ['ls', 'pwd', 'whoami', 'date'];
const allowedGitSubCommands = ['status', 'diff', 'log', 'add', 'commit'];

// ❌ 禁止命令
const blockedCommands = ['rm', 'sudo', 'dd', 'mkfs'];

// ❌ 禁止组合
const blockedPatterns = ['&&', '|', ';'];

// ✅ 安全检查
function isSafeCommand(cmd: string) {
    const trimmed = cmd.trim();

    if (blockedCommands.some(c => trimmed.includes(c))) return false;
    if (blockedPatterns.some(p => trimmed.includes(p))) return false;

    if (allowedBaseCommands.some(c => trimmed.startsWith(c))) return true;

    if (trimmed.startsWith('git')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) return false;

        const sub = parts[1];
        if (!allowedGitSubCommands.includes(sub)) return false;

        if (sub === 'commit') {
            return trimmed.includes('-m');
        }

        return true;
    }

    return false;
}

// ✅ JSON 提取
function extractJSON(text: string) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) return match[1];

    const match2 = text.match(/\{[\s\S]*\}/);
    if (match2) return match2[0];

    return text;
}

// 👉 执行命令
function runCommand(cmd: string): Promise<string> {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
            resolve((stdout || '') + (stderr || ''));
        });
    });
}

// 🚀 Agent 主循环
async function runAgent(input: string) {
    messages.push({ role: 'user', content: input });

    let steps = 0;
    const MAX_STEPS = 15; // 循环次数

    while (true) {
        if (steps++ > MAX_STEPS) {
            console.log('⚠️ 超过最大执行步数，停止');
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

        // ✅ 最终输出
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
                console.log('❌ 命令被拒绝');

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify({
                        type: 'command_result',
                        content: '命令被拒绝'
                    })
                });

                continue;
            }

            const result = await runCommand(cmd);

            console.log('📦 结果:\n', result);

            messages.push({
                role: 'assistant',
                content: JSON.stringify({
                    type: 'command_result',
                    content: result
                })
            });

            // ✅ commit 收尾逻辑（关键）
            if (cmd.startsWith('git commit')) {
                if (result.includes('nothing to commit')) {
                    console.log('⚠️ 没有可提交内容');

                    messages.push({
                        role: 'assistant',
                        content: JSON.stringify({
                            type: 'text',
                            content: '没有需要提交的更改'
                        })
                    });
                } else {
                    console.log('✅ 提交完成');

                    messages.push({
                        role: 'assistant',
                        content: JSON.stringify({
                            type: 'text',
                            content: '已完成 git 提交'
                        })
                    });
                }

                break;
            }

            continue;
        }
    }
}

// CLI
console.log('开始聊天（输入 exit 退出）');
rl.prompt();

rl.on('line', async (input) => {
    if (input.trim() === 'exit') {
        rl.close();
        return;
    }

    try {
        await runAgent(input);
    } catch (err) {
        console.error('出错:', err);
    }

    rl.prompt();
});

rl.on('close', () => {
    console.log('聊天结束 👋');
    process.exit(0);
});