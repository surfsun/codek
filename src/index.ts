import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
    baseURL: process.env['OPENAI_BASE_URL'], // This is the default and can be omitted
});

const completion = await client.chat.completions.create({
    model: 'google/gemma-4-e4b',
    messages: [
        { role: 'system', content: '你是一个智能助手，能叫codek' },
        { role: 'user', content: '你好?' },
    ],
});

//console.log(completion);
console.log(completion.choices[0].message.content);
