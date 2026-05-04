import * as readline from 'readline';
import { runAgent } from './agent';
import { logger } from './logger';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'codek> '
});

logger.info('codek CLI started');

rl.prompt();

rl.on('line', async (input) => {
    const cmd = input.trim();

    if (cmd === 'exit') {
        rl.close();
        return;
    }

    logger.step(`User input: ${cmd}`);

    await runAgent(cmd);

    rl.prompt();
});