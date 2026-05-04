import * as readline from 'readline';
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

// 👉 保存对话上下文（关键）
const messages = [
    { role: 'system', content: '你是一个智能助手，名字叫 codek' }
];

console.log('开始聊天（输入 exit 退出）');
rl.prompt();

rl.on('line', async (input) => {
    const text = input.trim();

    if (text === 'exit') {
        rl.close();
        return;
    }

    try {
        // 👉 记录用户输入
        messages.push({ role: 'user', content: text });

        const completion = await client.chat.completions.create({
            model: 'google/gemma-4-e4b',
            messages,
        });

        const reply = completion.choices[0].message.content;

        // 👉 输出 AI 回复
        console.log('AI>', reply);

        // 👉 记录 AI 回复（实现上下文记忆）
        messages.push({ role: 'assistant', content: reply });

    } catch (err) {
        console.error('出错了:', err);
    }

    rl.prompt(); // 👉 继续下一轮输入
});

rl.on('close', () => {
    console.log('聊天结束 👋');
    process.exit(0);
});