#!/usr/bin/env node
import { createInterface } from 'readline/promises';
import * as readline from 'readline';
import { readFileSync } from 'fs';
import { stdin as input, stdout as output } from 'process';
import { CodekAgent } from './agent.js';
import { CodekConfig, ModelProfile, defaultHistoryPath, defaultMemoryPath, defaultSummaryPath, getConfig, parseBoolean, parseShellApprovalMode, setConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { getVerbose, setVerbose } from './logger.js';
import { JsonlConversationArchive, NullConversationArchive } from './storage/archive.js';
import { JsonMemoryStore, NullMemoryStore } from './storage/memory.js';
import { JsonlSummaryStore, NullSummaryStore } from './storage/summary.js';
import { AgentEvent, MemoryStore, SummaryStore } from './types.js';

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
  --model <name>       model name, defaults to CODEK_MODEL or deepseek-v4-flash
  --cwd <path>         working directory, defaults to current directory
  --base-url <url>     OpenAI-compatible API URL, defaults to local service
  --api-key <key>      API key, defaults to OPENAI_API_KEY or codek-local
  --max-steps <n>      maximum agent tool steps, defaults to 50
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
  /log                 show or change verbose logging: /log on, /log off, /log toggle
  /model               choose model interactively
  /model current       show current model
  /model list          list supported models
  /model <name>        switch to a model by name
  /memory              list durable memories
  /memory add <text>   add a project memory
  /memory forget <id>  remove a memory
  /summary             list recent conversation summaries
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
        historyEnabled: process.env.CODEK_HISTORY === undefined ? undefined : parseBoolean(process.env.CODEK_HISTORY, true),
        memoryEnabled: process.env.CODEK_MEMORY === undefined ? undefined : parseBoolean(process.env.CODEK_MEMORY, true),
        summaryEnabled: process.env.CODEK_SUMMARIES === undefined ? undefined : parseBoolean(process.env.CODEK_SUMMARIES, true),
    });

    const config = getConfig();
    if (!process.env.CODEK_HISTORY_PATH) {
        setConfig({ historyPath: defaultHistoryPath(config.cwd) });
    }
    if (!process.env.CODEK_MEMORY_PATH) {
        setConfig({ memoryPath: defaultMemoryPath(config.cwd) });
    }
    if (!process.env.CODEK_SUMMARY_PATH) {
        setConfig({ summaryPath: defaultSummaryPath(config.cwd) });
    }

    if (!Number.isFinite(config.maxSteps) || config.maxSteps < 1) {
        throw new Error('--max-steps must be a positive number');
    }

    setVerbose(config.verbose);
    return getConfig();
}

type SelectOption<T> = {
    value: T;
    label: string;
    description?: string;
};

function interactiveSelect<T>(
    title: string,
    options: Array<SelectOption<T>>,
    currentValue: T,
): Promise<T> {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
            resolve(currentValue);
            return;
        }

        const initialIndex = Math.max(0, options.findIndex(option => Object.is(option.value, currentValue)));
        let selectedIndex = initialIndex;
        let firstRender = true;

        stdout.write('\x1b[?25l');

        const render = () => {
            if (firstRender) {
                firstRender = false;
            } else {
                stdout.write(`\x1b[${options.length + 3}A\x1b[J`);
            }

            stdout.write(`--- ${title} ---\n`);
            for (let index = 0; index < options.length; index++) {
                const option = options[index];
                const selected = index === selectedIndex;
                const prefix = selected ? '\x1b[7m' : '';
                const suffix = selected ? '\x1b[0m' : '';
                const description = option.description ? ` - ${option.description}` : '';
                stdout.write(`  ${prefix}${option.label}${description}${suffix}\n`);
            }
            stdout.write('Use ↑↓ to change, Enter to confirm\n');
        };

        const cleanup = () => {
            stdin.off('keypress', onKeypress);
            stdin.setRawMode(false);
            stdout.write('\x1b[?25h');
            stdout.write(`\x1b[${options.length + 3}A\x1b[J`);
        };

        const onKeypress = (_str: string, key: readline.Key) => {
            if (key.name === 'up') {
                selectedIndex = (selectedIndex + options.length - 1) % options.length;
                render();
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % options.length;
                render();
                return;
            }

            if (key.name === 'return') {
                cleanup();
                resolve(options[selectedIndex].value);
                return;
            }

            if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
                cleanup();
                stdout.write('\n');
                resolve(currentValue);
            }
        };

        readline.emitKeypressEvents(stdin);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('keypress', onKeypress);
        render();
    });
}

function interactiveLogSelect(current: boolean): Promise<boolean> {
    return interactiveSelect('Log Output', [
        { value: true, label: 'ON' },
        { value: false, label: 'OFF' },
    ], current);
}

function modelOptions(config: CodekConfig): Array<SelectOption<string>> {
    const seen = new Set<string>();
    const profiles: ModelProfile[] = config.modelProfiles.filter(profile => {
        if (seen.has(profile.id)) return false;
        seen.add(profile.id);
        return true;
    });
    if (!seen.has(config.model)) {
        profiles.unshift({ id: config.model, label: config.model });
    }

    return profiles.map(profile => ({
        value: profile.id,
        label: profile.id === config.model ? `${profile.label} (current)` : profile.label,
        description: profile.description,
    }));
}

function printModelList(config: CodekConfig) {
    output.write(`Current model: ${config.model}\n`);
    output.write('Supported models:\n');
    for (const option of modelOptions(config)) {
        const marker = option.value === config.model ? '*' : ' ';
        const description = option.description ? ` - ${option.description}` : '';
        output.write(` ${marker} ${option.value}${description}\n`);
    }
}

function renderAgentEvent(event: AgentEvent) {
    switch (event.type) {
        case 'status':
            if (event.status === 'done') {
                process.stderr.write('[done] ready\n');
                return;
            }
            if (event.status === 'error') {
                process.stderr.write(`[error] ${event.message ?? 'failed'}\n`);
                return;
            }
            process.stderr.write(`[${event.status}] ${event.message ?? ''}\n`);
            return;
        case 'step':
            process.stderr.write(`[step] ${event.step}/${event.maxSteps}\n`);
            return;
        case 'tool_start':
            process.stderr.write(`[tool] ${event.name} started\n`);
            return;
        case 'tool_end':
            process.stderr.write(`[tool] ${event.name} ${event.ok ? 'finished' : 'failed'}\n`);
            return;
        case 'error':
            process.stderr.write(`[error] ${event.message}\n`);
            return;
        case 'model':
            return;
    }
}

async function refreshAgentMemories(agent: CodekAgent, memoryStore: MemoryStore) {
    agent.setMemories(await memoryStore.list());
}

function printMemories(memories: Awaited<ReturnType<MemoryStore['list']>>) {
    if (memories.length === 0) {
        output.write('(no memories)\n');
        return;
    }

    for (const memory of memories) {
        output.write(`${memory.id} [${memory.scope}] ${memory.content}\n`);
    }
}

async function handleMemoryCommand(line: string, agent: CodekAgent, config: CodekConfig, memoryStore: MemoryStore) {
    if (!config.memoryEnabled) {
        output.write('Memory is disabled. Set CODEK_MEMORY=on to enable it.\n');
        return;
    }

    if (line === '/memory' || line === '/memory list') {
        printMemories(await memoryStore.list());
        return;
    }

    if (line.startsWith('/memory add ')) {
        const content = line.slice('/memory add'.length).trim();
        if (!content) {
            output.write('Usage: /memory add <text>\n');
            return;
        }

        const memory = await memoryStore.add(content, 'project');
        await refreshAgentMemories(agent, memoryStore);
        output.write(`Added memory ${memory.id}.\n`);
        return;
    }

    if (line.startsWith('/memory forget ')) {
        const id = line.slice('/memory forget'.length).trim();
        if (!id) {
            output.write('Usage: /memory forget <id>\n');
            return;
        }

        const removed = await memoryStore.remove(id);
        await refreshAgentMemories(agent, memoryStore);
        output.write(removed ? `Forgot memory ${id}.\n` : `Memory not found: ${id}\n`);
        return;
    }

    output.write('Usage: /memory, /memory list, /memory add <text>, or /memory forget <id>\n');
}

async function handleSummaryCommand(config: CodekConfig, summaryStore: SummaryStore) {
    if (!config.summaryEnabled) {
        output.write('Summaries are disabled. Set CODEK_SUMMARIES=on to enable them.\n');
        return;
    }

    const summaries = await summaryStore.list(10);
    if (summaries.length === 0) {
        output.write('(no summaries)\n');
        return;
    }

    for (const summary of summaries) {
        output.write(`${summary.id} ${summary.createdAt} ${summary.model}\n`);
        output.write(`  user: ${summary.userRequest}\n`);
        output.write(`  final: ${summary.finalAnswer}\n`);
        output.write(`  conversation: ${summary.conversationId}\n`);
    }
}

async function runInteractive(
    agent: CodekAgent,
    config: CodekConfig,
    memoryStore: MemoryStore,
    summaryStore: SummaryStore,
) {
    let rl = createInterface({ input, output });
    output.write(`codek ${readPackageVersion()} (${config.model})\n`);
    output.write(`cwd: ${config.cwd}\n`);
    output.write(`api: ${config.baseURL}\n`);
    output.write(`shell approval: ${config.shellApprovalMode}\n`);
    output.write(`history: ${config.historyEnabled ? config.historyPath : 'disabled'}\n`);
    output.write(`memory: ${config.memoryEnabled ? config.memoryPath : 'disabled'}\n`);
    output.write(`summaries: ${config.summaryEnabled ? config.summaryPath : 'disabled'}\n`);
    output.write('Type /help for commands.\n\n');

    while (true) {
        let line: string;
        try {
            line = (await rl.question('codek> ')).trim();
        } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
            if (code === 'ERR_USE_AFTER_CLOSE') {
                return;
            }
            throw error;
        }
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

        if (line === '/memory' || line.startsWith('/memory ')) {
            await handleMemoryCommand(line, agent, config, memoryStore);
            continue;
        }

        if (line === '/summary' || line === '/summary list' || line === '/summaries') {
            await handleSummaryCommand(config, summaryStore);
            continue;
        }

        if (line === '/log') {
            const isLoggingOn = getVerbose();
            output.write('\n');
            const newValue = await interactiveLogSelect(isLoggingOn);
            if (newValue !== isLoggingOn) {
                setVerbose(newValue);
                output.write(`Log output ${newValue ? 'enabled' : 'disabled'}.\n`);
            } else {
                output.write('Log status unchanged.\n');
            }
            continue;
        }

        if (line.startsWith('/log ')) {
            const mode = line.slice('/log'.length).trim();

            if (mode === 'on') {
                setVerbose(true);
                output.write('Log output enabled.\n');
                continue;
            }

            if (mode === 'off') {
                setVerbose(false);
                output.write('Log output disabled.\n');
                continue;
            }

            output.write('Usage: /log, /log on, or /log off\n');
            continue;
        }

        if (line === '/model') {
            output.write('\n');
            const selectedModel = await interactiveSelect('Model', modelOptions(config), config.model);
            if (selectedModel !== config.model) {
                config.model = selectedModel;
                agent.setModel(selectedModel);
                output.write(`Model switched to ${selectedModel}.\n`);
            } else {
                output.write(`Model unchanged: ${config.model}\n`);
            }
            continue;
        }

        if (line === '/model current') {
            output.write(`${agent.getModel()}\n`);
            continue;
        }

        if (line === '/model list' || line === '/models') {
            printModelList(config);
            continue;
        }

        if (line.startsWith('/model ')) {
            const model = line.slice('/model'.length).trim();
            if (!model) {
                output.write('Usage: /model, /model current, /model list, or /model <name>\n');
                continue;
            }

            config.model = model;
            agent.setModel(model);
            output.write(`Model switched to ${model}.\n`);
            continue;
        }

        rl.close();
        try {
            const result = await agent.run(line);
            output.write(`${result}\n\n`);
        } catch (error) {
            console.error(error);
        }
        finally {
            rl = createInterface({ input, output });
        }
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
    const archive = config.historyEnabled
        ? new JsonlConversationArchive(config.historyPath)
        : new NullConversationArchive();
    const memoryStore = config.memoryEnabled
        ? new JsonMemoryStore(config.memoryPath)
        : new NullMemoryStore();
    const summaryStore = config.summaryEnabled
        ? new JsonlSummaryStore(config.summaryPath)
        : new NullSummaryStore();
    const agent = new CodekAgent(config, renderAgentEvent, archive, summaryStore);
    await refreshAgentMemories(agent, memoryStore);

    if (options.prompt) {
        const result = await agent.run(options.prompt);
        output.write(`${result}\n`);
        return;
    }

    await runInteractive(agent, config, memoryStore, summaryStore);
}

main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[error] ${message}\n`);
    process.exitCode = 1;
});
