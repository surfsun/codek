#!/usr/bin/env node
import { createInterface } from 'readline/promises';
import { readFileSync } from 'fs';
import { stdin as input, stdout as output } from 'process';
import { CodekAgent } from './agent.js';
import { CodekConfig, getConfig, parseShellApprovalMode, setConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { setVerbose } from './logger.js';

type CliOptions = Partial<CodekConfig> & {
    help?: boolean;
    version?: boolean;
    prompt?: string;
};

const helpText = `codek - terminal coding agent

Usage:
  codek [prompt]
  codek --cwd /path/to/project "inspect this repo"

Options:
  --model <name>       model name, defaults to CODEK_MODEL or google/gemma-4-e4b
  --cwd <path>         working directory, defaults to current directory
  --base-url <url>     OpenAI-compatible API URL, defaults to local service
  --api-key <key>      API key, defaults to OPENAI_API_KEY or codek-local
  --max-steps <n>      maximum agent tool steps, defaults to 20
  --shell-approval <mode>
                       shell approval mode: ask, model, or allow
                       ask: ask before every command
                       model: model decides, dangerous commands still ask
                       allow: always execute commands
  --yes, -y            alias for --shell-approval allow
  --verbose, -v        print model/tool trace to stderr
  --version            print version
  --help, -h           show help

Interactive commands:
  /help                show this help
  /clear               clear conversation context
  /model               show current model
  /exit                quit`;

function readPackageVersion() {
    try {
        const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version?: string };
        return packageJson.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {};
    const prompt: string[] = [];

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];

        switch (arg) {
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--version':
                options.version = true;
                break;
            case '--model':
                options.model = argv[++index];
                break;
            case '--cwd':
                options.cwd = argv[++index];
                break;
            case '--base-url':
                options.baseURL = argv[++index];
                break;
            case '--api-key':
                options.apiKey = argv[++index];
                break;
            case '--max-steps':
                options.maxSteps = Number(argv[++index]);
                break;
            case '--shell-approval':
                options.shellApprovalMode = parseShellApprovalMode(argv[++index]);
                break;
            case '--yes':
            case '-y':
                options.shellApprovalMode = 'allow';
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            default:
                prompt.push(arg);
        }
    }

    if (prompt.length > 0) {
        options.prompt = prompt.join(' ');
    }

    return options;
}

function normalizeConfig(options: CliOptions): CodekConfig {
    loadDotEnv(options.cwd);

    setConfig({
        model: options.model ?? process.env.CODEK_MODEL ?? process.env.OPENAI_MODEL,
        cwd: options.cwd,
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
        baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
        maxSteps: options.maxSteps ?? Number(process.env.CODEK_MAX_STEPS || getConfig().maxSteps),
        shellApprovalMode: options.shellApprovalMode ?? parseShellApprovalMode(process.env.CODEK_SHELL_APPROVAL_MODE),
        verbose: options.verbose,
    });

    const config = getConfig();

    if (!Number.isFinite(config.maxSteps) || config.maxSteps < 1) {
        throw new Error('--max-steps must be a positive number');
    }

    setVerbose(config.verbose);
    return config;
}

async function runInteractive(agent: CodekAgent, config: CodekConfig) {
    const rl = createInterface({ input, output });
    output.write(`codek ${readPackageVersion()} (${config.model})\n`);
    output.write(`cwd: ${config.cwd}\n`);
    output.write(`api: ${config.baseURL}\n`);
    output.write(`shell approval: ${config.shellApprovalMode}\n`);
    output.write('Type /help for commands.\n\n');

    while (true) {
        const line = (await rl.question('codek> ')).trim();
        if (!line) continue;

        if (line === '/exit' || line === 'exit' || line === 'quit') {
            rl.close();
            return;
        }

        if (line === '/help') {
            output.write(`${helpText}\n`);
            continue;
        }

        if (line === '/clear') {
            agent.clear();
            output.write('Context cleared.\n');
            continue;
        }

        if (line === '/model') {
            output.write(`${config.model}\n`);
            continue;
        }

        const result = await agent.run(line);
        output.write(`${result}\n\n`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        output.write(`${helpText}\n`);
        return;
    }

    if (options.version) {
        output.write(`${readPackageVersion()}\n`);
        return;
    }

    const config = normalizeConfig(options);
    const agent = new CodekAgent(config);

    if (options.prompt) {
        const result = await agent.run(options.prompt);
        output.write(`${result}\n`);
        return;
    }

    await runInteractive(agent, config);
}

main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[error] ${message}\n`);
    process.exitCode = 1;
});
