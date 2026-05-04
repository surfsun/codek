import * as fs from 'fs';
import { exec } from 'child_process';
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

const systemPrompt = `
你是一个工程级 AI Agent（codek）

你可以使用工具解决问题：

1. 读文件：
{ "type": "read_file", "path": "路径" }

2. 写文件：
{ "type": "write_file", "path": "路径", "content": "完整文件内容" }

3. 执行命令：
{ "type": "run_command", "command": "命令" }

4. 提交代码：
{ "type": "git_commit", "message": "提交信息" }

5. 最终回答：
{ "type": "final", "content": "结果" }

⚠️ 必须输出 JSON
⚠️ 不要解释
⚠️ 不要 markdown

原则：
- 优先读代码再修改
- 修改必须完整文件
- 出错必须修复
- 完成后必须 commit
`;

let messages: any[] = [
    { role: 'system', content: systemPrompt }
];

// ================= 工具实现 =================

function runCommand(cmd: string): Promise<string> {
    return new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
            resolve((stdout || '') + (stderr || ''));
        });
    });
}

function readFile(path: string) {
    return fs.readFileSync(path, 'utf-8');
}

function writeFile(path: string, content: string) {
    fs.writeFileSync(path, content);
    return '写入成功';
}

async function gitCommit(message: string) {
    await runCommand('git add .');
    return await runCommand(`git commit -m "${message}"`);
}

// ================= Agent =================

async function agent(input: string) {
    messages.push({ role: 'user', content: input });

    for (let i = 0; i < 20; i++) {

        const res = await client.chat.completions.create({
            model: 'google/gemma-4-e4b',
            messages,
            temperature: 0,
        });

        const reply = res.choices[0].message.content;
        console.log('🤖', reply);

        let action;
        try {
            action = JSON.parse(reply!);
        } catch {
            console.log('❌ JSON 解析失败');
            continue;
        }

        // ===== FINAL =====
        if (action.type === 'final') {
            console.log('✅', action.content);
            return;
        }

        let result = '';

        // ===== TOOL: read =====
        if (action.type === 'read_file') {
            result = readFile(action.path);
        }

        // ===== TOOL: write =====
        if (action.type === 'write_file') {
            result = writeFile(action.path, action.content);
        }

        // ===== TOOL: command =====
        if (action.type === 'run_command') {
            result = await runCommand(action.command);
        }

        // ===== TOOL: git =====
        if (action.type === 'git_commit') {
            result = await gitCommit(action.message);
        }

        console.log('📦', result);

        // 👉 关键：反馈给模型
        messages.push({
            role: 'user',
            content: JSON.stringify({
                type: 'tool_result',
                content: result
            })
        });
    }

    console.log('⚠️ 超出最大步数');
}

// 测试
agent("修复项目报错并提交代码");