#!/usr/bin/env node
import { createInterface } from 'readline/promises';
import { readFileSync } from 'fs';
import { stdin as input, stdout as output } from 'process';
import { CodekAgent } from './agent.js';
import { CodekConfig, LlmTraceMode, ModelProfile, defaultHistoryPath, defaultLogDir, defaultMemoryPath, defaultSummaryPath, getConfig, parseBoolean, parseLlmTraceMode, parseModelProfiles, parseShellApprovalMode, setConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { configureLogger, getLlmLogPath, getVerbose, logger, setVerbose } from './logger.js';
import { viewLlmLog } from './llm-viewer.js';
import { JsonlConversationArchive, NullConversationArchive } from './storage/archive.js';
import { JsonMemoryStore, NullMemoryStore } from './storage/memory.js';
import { JsonlSummaryStore, NullSummaryStore } from './storage/summary.js';
import { MemoryStore, SummaryStore } from './types.js';
import { SelectOption, TerminalStatus, printBanner, printDoctor, printStatus, selectOne } from './terminal/ui.js';

type CliOptions = Partial<CodekConfig> & {
    help?: boolean;
    version?: boolean;
    prompt?: string;
    envPath?: string;
};

const helpText = `codek - terminal coding agent

Usage:
  codek [prompt]
  codek --cwd /path/to/project "inspect this repo"

Options:
  --model <name>       model name, defaults to CODEK_MODEL or deepseek-v4-flash
  --cwd <path>         working directory, defaults to current directory
  --env <path>         load an extra .env file after user and project .env files
  --base-url <url>     OpenAI-compatible API URL, defaults to local service
  --api-key <key>      API key, defaults to OPENAI_API_KEY or codek-local
  --max-run <seconds>  maximum wall-clock time per request, defaults to 600
  --max-steps <n>      internal safety limit for agent turns
  --shell-approval <mode>
                       shell approval mode: ask, model, or allow
                       ask: ask before every command
                       model: model decides, dangerous commands still ask
                       allow: always execute commands
  --yes, -y            alias for --shell-approval allow
  --verbose, -v        print model/tool trace to stderr
  --llm-trace [mode]   show live LLM messages on stderr: compact or full
  --version            print version
  --help, -h           show help

Interactive commands:
  /help                show this help
  /status              show current configuration and storage paths
  /doctor              show runtime and configuration diagnostics
  /clear               clear conversation context
  /log                 show or change terminal debug output: /log on, /log off
  /llm                 show LLM recording status
  /llm list            browse recorded LLM requests and responses
  /llm live            show or change live LLM trace: /llm live on, /llm live full, /llm live off
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
            case '--env':
                options.envPath = argv[++index];
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
            case '--max-run':
                options.maxRunMs = Number(argv[++index]) * 1000;
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
            case '--llm-trace': {
                const next = argv[index + 1];
                if (next && !next.startsWith('-') && parseInteractiveLlmTraceMode(next)) {
                    options.llmTrace = parseLlmTraceMode(next);
                    index++;
                } else {
                    options.llmTrace = 'compact';
                }
                break;
            }
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
    loadDotEnv(options.cwd, options.envPath);

    setConfig({
        model: options.model ?? process.env.CODEK_MODEL ?? process.env.OPENAI_MODEL,
        modelProfiles: parseModelProfiles(process.env.CODEK_MODELS) ?? getConfig().modelProfiles,
        cwd: options.cwd,
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
        baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
        maxSteps: options.maxSteps ?? Number(process.env.CODEK_MAX_STEPS || getConfig().maxSteps),
        maxRunMs: options.maxRunMs ?? Number(process.env.CODEK_MAX_RUN_MS || getConfig().maxRunMs),
        shellApprovalMode: options.shellApprovalMode ?? parseShellApprovalMode(process.env.CODEK_SHELL_APPROVAL_MODE),
        verbose: options.verbose,
        historyEnabled: process.env.CODEK_HISTORY === undefined ? undefined : parseBoolean(process.env.CODEK_HISTORY, true),
        memoryEnabled: process.env.CODEK_MEMORY === undefined ? undefined : parseBoolean(process.env.CODEK_MEMORY, true),
        summaryEnabled: process.env.CODEK_SUMMARIES === undefined ? undefined : parseBoolean(process.env.CODEK_SUMMARIES, true),
        logEnabled: process.env.CODEK_LOGS === undefined ? undefined : parseBoolean(process.env.CODEK_LOGS, true),
        llmTrace: options.llmTrace ?? parseLlmTraceMode(process.env.CODEK_LLM_TRACE),
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
    if (!process.env.CODEK_LOG_DIR) {
        setConfig({ logDir: defaultLogDir(config.cwd) });
    }

    if (!Number.isFinite(config.maxSteps) || config.maxSteps < 1) {
        throw new Error('--max-steps must be a positive number');
    }
    if (!Number.isFinite(config.maxRunMs) || config.maxRunMs < 1_000) {
        throw new Error('--max-run must be at least 1 second');
    }

    setVerbose(config.verbose);
    return getConfig();
}

function createSessionId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function interactiveLogSelect(current: boolean): Promise<boolean> {
    return selectOne('Log Output', [
        { value: true, label: 'ON' },
        { value: false, label: 'OFF' },
    ], current);
}

function parseInteractiveLlmTraceMode(mode: string): LlmTraceMode | null {
    try {
        return parseLlmTraceMode(mode) ?? null;
    } catch {
        return null;
    }
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
    terminalStatus: TerminalStatus,
) {
    let rl = createInterface({ input, output });
    printBanner(readPackageVersion(), config);

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

        if (line === '/status') {
            printStatus(config);
            continue;
        }

        if (line === '/doctor') {
            printDoctor(config);
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

        if (line === '/llm') {
            output.write(`LLM recording: ${config.logEnabled ? 'on' : 'off'}\n`);
            output.write(`LLM log: ${getLlmLogPath() || 'inactive'}\n`);
            output.write(`Live trace: ${config.llmTrace}\n`);
            output.write('Usage: /llm list, /llm live on, /llm live full, or /llm live off\n');
            continue;
        }

        if (line === '/llm list') {
            await viewLlmLog(getLlmLogPath(), rl);
            continue;
        }

        if (line === '/llm live') {
            output.write(`Live trace: ${config.llmTrace}\n`);
            output.write('Usage: /llm live on, /llm live full, or /llm live off\n');
            continue;
        }

        if (line.startsWith('/llm live ')) {
            const mode = parseInteractiveLlmTraceMode(line.slice('/llm live'.length).trim());
            if (!mode) {
                output.write('Usage: /llm live on, /llm live full, or /llm live off\n');
                continue;
            }

            config.llmTrace = mode;
            output.write(`Live LLM trace ${mode === 'off' ? 'disabled' : `enabled (${mode})`}.\n`);
            continue;
        }

        if (line.startsWith('/llm ')) {
            output.write('Usage: /llm, /llm list, /llm live on, /llm live full, or /llm live off\n');
            continue;
        }

        if (line === '/model') {
            output.write('\n');
            const selectedModel = await selectOne('Model', modelOptions(config), config.model);
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
            terminalStatus.reset();
            const result = await agent.run(line);
            terminalStatus.clear();
            if (terminalStatus.didStream()) {
                output.write('\n\n');
            } else {
                output.write(`${result}\n\n`);
            }
        } catch (error) {
            terminalStatus.clear();
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
    const sessionId = createSessionId();
    configureLogger({
        enabled: config.logEnabled,
        logDir: config.logDir,
        sessionId,
    });
    logger.event('session_start', {
        sessionId,
        cwd: config.cwd,
        model: config.model,
        baseURL: config.baseURL,
        historyPath: config.historyEnabled ? config.historyPath : null,
        memoryPath: config.memoryEnabled ? config.memoryPath : null,
        summaryPath: config.summaryEnabled ? config.summaryPath : null,
    });
    const archive = config.historyEnabled
        ? new JsonlConversationArchive(config.historyPath)
        : new NullConversationArchive();
    const memoryStore = config.memoryEnabled
        ? new JsonMemoryStore(config.memoryPath)
        : new NullMemoryStore();
    const summaryStore = config.summaryEnabled
        ? new JsonlSummaryStore(config.summaryPath)
        : new NullSummaryStore();
    const terminalStatus = new TerminalStatus();
    const agent = new CodekAgent(config, event => terminalStatus.handle(event), archive, summaryStore);
    await refreshAgentMemories(agent, memoryStore);

    if (options.prompt) {
        terminalStatus.reset();
        const result = await agent.run(options.prompt);
        terminalStatus.clear();
        if (terminalStatus.didStream()) {
            output.write('\n');
        } else {
            output.write(`${result}\n`);
        }
        return;
    }

    await runInteractive(agent, config, memoryStore, summaryStore, terminalStatus);
}

main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[error] ${message}\n`);
    process.exitCode = 1;
});
