import * as readline from 'readline';
import { stdin as input, stdout as output } from 'process';
import { CodekConfig } from '../config.js';
import { AgentEvent } from '../types.js';
import { logger } from '../logger.js';

export type SelectOption<T> = {
    value: T;
    label: string;
    description?: string;
};

export type CommandApprovalDecision = 'allow-once' | 'allow-session' | 'reject';

export function formatDuration(ms: number) {
    if (ms < 1000) return `${ms}ms`;
    return `${Math.round(ms / 1000)}s`;
}

export function formatCommand(command: string, maxLength = 96) {
    const singleLine = command.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) return singleLine;
    return `${singleLine.slice(0, maxLength - 1)}...`;
}

export function printBanner(version: string, config: CodekConfig) {
    output.write(`codek ${version}  model: ${config.model}\n`);
    output.write(`cwd: ${config.cwd}\n`);
    output.write(`approval: ${config.shellApprovalMode}\n`);
    output.write('Type /help for commands, /status for details.\n\n');
}

export function printStatus(config: CodekConfig) {
    output.write(`model: ${config.model}\n`);
    output.write(`cwd: ${config.cwd}\n`);
    output.write(`api: ${config.baseURL}\n`);
    output.write(`shell approval: ${config.shellApprovalMode}\n`);
    output.write(`max run: ${formatDuration(config.maxRunMs)}\n`);
    output.write(`max steps: ${config.maxSteps}\n`);
    output.write(`history: ${config.historyEnabled ? config.historyPath : 'disabled'}\n`);
    output.write(`memory: ${config.memoryEnabled ? config.memoryPath : 'disabled'}\n`);
    output.write(`summaries: ${config.summaryEnabled ? config.summaryPath : 'disabled'}\n`);
    output.write(`logs: ${config.logEnabled ? config.logDir : 'disabled'}\n`);
    output.write(`LLM recording: ${config.logEnabled ? 'on' : 'off'}\n`);
    output.write(`LLM live trace: ${config.llmTrace}\n`);
}

export function printDoctor(config: CodekConfig) {
    output.write('Runtime\n');
    output.write(`  node: ${process.version}\n`);
    output.write(`  platform: ${process.platform} ${process.arch}\n`);
    output.write('Configuration\n');
    output.write(`  model: ${config.model}\n`);
    output.write(`  api: ${config.baseURL}\n`);
    output.write(`  api key: ${config.apiKey ? 'set' : 'missing'}\n`);
    output.write(`  cwd: ${config.cwd}\n`);
    output.write(`  logs: ${config.logEnabled ? 'enabled' : 'disabled'}\n`);
    output.write(`  LLM recording: ${config.logEnabled ? 'on' : 'off'}\n`);
    output.write(`  LLM live trace: ${config.llmTrace}\n`);
}

function writeTraceHeader(title: string) {
    process.stderr.write(`\n[llm] ${title}\n`);
}

function writeTraceBlock(label: string, content: string) {
    process.stderr.write(`[llm] ${label}\n`);
    if (content) {
        process.stderr.write(`${content.endsWith('\n') ? content : `${content}\n`}`);
    } else {
        process.stderr.write('(empty)\n');
    }
}

function supportsInteractiveSelect() {
    return input.isTTY && output.isTTY && typeof input.setRawMode === 'function';
}

function clearRenderedBlock(lineCount: number) {
    if (lineCount <= 0) return;
    output.write(`\x1b[${lineCount}A\x1b[J`);
}

function truncateLine(value: string, reservedColumns = 0) {
    const columns = Math.max(20, (output.columns || 80) - reservedColumns);
    if (value.length <= columns) return value;
    return `${value.slice(0, columns - 1)}...`;
}

export function selectOne<T>(
    title: string,
    options: Array<SelectOption<T>>,
    currentValue: T,
): Promise<T> {
    return new Promise((resolve) => {
        if (!supportsInteractiveSelect()) {
            resolve(currentValue);
            return;
        }

        const initialIndex = Math.max(0, options.findIndex(option => Object.is(option.value, currentValue)));
        let selectedIndex = initialIndex;
        let firstRender = true;
        let renderedLines = 0;

        output.write('\x1b[?25l');

        const render = () => {
            if (firstRender) {
                firstRender = false;
            } else {
                clearRenderedBlock(renderedLines);
            }

            output.write(`${title}\n`);
            renderedLines = 1;
            for (let index = 0; index < options.length; index++) {
                const option = options[index];
                const selected = index === selectedIndex;
                const prefix = selected ? '\x1b[7m' : '';
                const suffix = selected ? '\x1b[0m' : '';
                const description = option.description ? ` - ${option.description}` : '';
                output.write(`  ${prefix}${truncateLine(`${option.label}${description}`, 2)}${suffix}\n`);
                renderedLines++;
            }
            output.write('Use up/down and Enter. Esc cancels.\n');
            renderedLines++;
        };

        const cleanup = () => {
            input.off('keypress', onKeypress);
            input.setRawMode(false);
            output.write('\x1b[?25h');
            clearRenderedBlock(renderedLines);
            renderedLines = 0;
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
                output.write('\n');
                resolve(currentValue);
            }
        };

        readline.emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        input.on('keypress', onKeypress);
        render();
    });
}

export function selectMany(
    title: string,
    options: Array<SelectOption<string>>,
): Promise<string[]> {
    return new Promise((resolve) => {
        if (!supportsInteractiveSelect()) {
            resolve(options[0] ? [options[0].value] : []);
            return;
        }

        const selected = new Set<number>();
        let selectedIndex = 0;
        let firstRender = true;
        let renderedLines = 0;

        output.write('\x1b[?25l');

        const render = () => {
            if (firstRender) {
                firstRender = false;
            } else {
                clearRenderedBlock(renderedLines);
            }

            output.write(`${title}\n`);
            renderedLines = 1;
            for (let index = 0; index < options.length; index++) {
                const option = options[index];
                const focused = index === selectedIndex;
                const prefix = focused ? '\x1b[7m' : '';
                const suffix = focused ? '\x1b[0m' : '';
                const marker = selected.has(index) ? '[x]' : '[ ]';
                const description = option.description ? ` - ${option.description}` : '';
                output.write(`  ${prefix}${truncateLine(`${marker} ${option.label}${description}`, 2)}${suffix}\n`);
                renderedLines++;
            }
            output.write('Use up/down, Space to select, Enter to confirm. Esc cancels.\n');
            renderedLines++;
        };

        const cleanup = () => {
            input.off('keypress', onKeypress);
            input.setRawMode(false);
            output.write('\x1b[?25h');
            clearRenderedBlock(renderedLines);
            renderedLines = 0;
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

            if (key.name === 'space') {
                if (selected.has(selectedIndex)) {
                    selected.delete(selectedIndex);
                } else {
                    selected.add(selectedIndex);
                }
                render();
                return;
            }

            if (key.name === 'return') {
                cleanup();
                const values = Array.from(selected).map(index => options[index]?.value).filter(Boolean);
                resolve(values.length > 0 ? values : (options[0] ? [options[0].value] : []));
                return;
            }

            if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
                cleanup();
                output.write('\n');
                resolve([]);
            }
        };

        readline.emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        input.on('keypress', onKeypress);
        render();
    });
}

const commandApprovalOptions: Array<{ label: string; decision: CommandApprovalDecision }> = [
    { label: 'Execute once', decision: 'allow-once' },
    { label: 'Always allow this exact command this session', decision: 'allow-session' },
    { label: 'Reject and stop current task', decision: 'reject' },
];

function commandDecisionFromChoice(choice: string): CommandApprovalDecision {
    if (!choice) return 'allow-once';
    if (choice === '1') return 'allow-once';
    if (choice === '2') return 'allow-session';
    return 'reject';
}

function renderCommandApprovalOptions(selectedIndex: number) {
    output.write('Choose an action:\n');
    for (let index = 0; index < commandApprovalOptions.length; index++) {
        const prefix = index === selectedIndex ? '\x1b[7m' : '';
        const suffix = index === selectedIndex ? '\x1b[0m' : '';
        output.write(`  ${prefix}${index + 1}. ${commandApprovalOptions[index].label}${suffix}\n`);
    }
    output.write('Use up/down and Enter. Default: 1\n');
}

async function commandApprovalFallback(): Promise<CommandApprovalDecision> {
    const rl = readline.createInterface({ input, output });

    return new Promise((resolve) => {
        rl.question('> ', (answer: string) => {
            rl.close();
            resolve(commandDecisionFromChoice(answer.trim()));
        });
    });
}

async function selectCommandApproval(): Promise<CommandApprovalDecision> {
    if (!supportsInteractiveSelect()) {
        return commandApprovalFallback();
    }

    let selectedIndex = 0;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    renderCommandApprovalOptions(selectedIndex);

    return new Promise((resolve) => {
        const finish = (decision: CommandApprovalDecision) => {
            input.setRawMode(false);
            input.off('keypress', onKeypress);
            output.write('\n');
            resolve(decision);
        };

        const onKeypress = (str: string, key: readline.Key) => {
            if (key.name === 'up') {
                selectedIndex = (selectedIndex + commandApprovalOptions.length - 1) % commandApprovalOptions.length;
                output.write('\x1b[5A\x1b[J');
                renderCommandApprovalOptions(selectedIndex);
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % commandApprovalOptions.length;
                output.write('\x1b[5A\x1b[J');
                renderCommandApprovalOptions(selectedIndex);
                return;
            }

            if (key.name === 'return') {
                finish(commandApprovalOptions[selectedIndex].decision);
                return;
            }

            if (str === '1' || str === '2' || str === '3') {
                finish(commandDecisionFromChoice(str));
                return;
            }

            if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
                finish('reject');
            }
        };

        input.on('keypress', onKeypress);
    });
}

export async function confirmCommandApproval(params: {
    command: string;
    cwd: string;
    reason: string;
}): Promise<CommandApprovalDecision> {
    output.write(`\nCommand approval required\n`);
    output.write(`Reason: ${params.reason}\n`);
    output.write(`Cwd: ${params.cwd}\n\n`);
    output.write(`${params.command}\n\n`);
    return selectCommandApproval();
}

export class TerminalStatus {
    private startedAt = Date.now();
    private hasStatus = false;
    private streamed = false;
    private step = 0;
    private maxSteps = 0;
    private llmDeltaKind: string | null = null;

    reset() {
        this.startedAt = Date.now();
        this.streamed = false;
        this.step = 0;
        this.maxSteps = 0;
        this.llmDeltaKind = null;
        this.clear();
    }

    didStream() {
        return this.streamed;
    }

    handle(event: AgentEvent) {
        logger.event('agent_event', event as unknown as Record<string, unknown>);

        switch (event.type) {
            case 'status':
                if (event.status === 'thinking') {
                    this.render('thinking');
                    return;
                }
                if (event.status === 'archiving') {
                    this.render('saving history');
                    return;
                }
                if (event.status === 'summarizing') {
                    this.render('saving summary');
                    return;
                }
                if (event.status === 'done') {
                    this.clear();
                    return;
                }
                if (event.status === 'error') {
                    this.clear();
                    process.stderr.write(`[error] ${event.message ?? 'failed'}\n`);
                    return;
                }
                return;
            case 'tool_start':
                this.render(event.inputSummary ? `${event.name} ${event.inputSummary}` : `running ${event.name}`);
                return;
            case 'tool_end':
                this.render(`${event.name} ${event.ok ? 'done' : 'failed'}${event.durationMs === undefined ? '' : ` ${formatDuration(event.durationMs)}`}`);
                return;
            case 'assistant_delta':
                this.clear();
                this.streamed = true;
                output.write(event.content);
                return;
            case 'llm_request':
                this.clear();
                writeTraceHeader(`request step ${event.step} | model ${event.model} | ${event.messages.length} messages`);
                process.stderr.write(`[llm] tools: ${event.tools.join(', ') || 'none'}\n`);
                for (let index = 0; index < event.messages.length; index++) {
                    const message = event.messages[index];
                    const suffix = message.name ? ` name=${message.name}` : '';
                    writeTraceBlock(`message ${index + 1} ${message.role}${suffix}`, message.content);
                    if (message.toolCalls?.length) {
                        process.stderr.write(`[llm] tool calls: ${message.toolCalls.join(', ')}\n`);
                    }
                }
                return;
            case 'llm_response_start':
                this.clear();
                this.llmDeltaKind = null;
                writeTraceHeader(`response step ${event.step}`);
                return;
            case 'llm_response_delta':
                this.clear();
                if (this.llmDeltaKind !== event.kind) {
                    if (this.llmDeltaKind) {
                        process.stderr.write('\n');
                    }
                    process.stderr.write(`[llm:${event.kind}] `);
                    this.llmDeltaKind = event.kind;
                }
                process.stderr.write(event.content);
                return;
            case 'llm_response_complete':
                this.clear();
                if (this.llmDeltaKind) {
                    process.stderr.write('\n');
                    this.llmDeltaKind = null;
                }
                process.stderr.write(`[llm] response complete | content ${event.contentLength} chars | reasoning ${event.reasoningLength} chars | tool calls ${event.toolCalls.join(', ') || 'none'}\n`);
                return;
            case 'error':
                this.clear();
                process.stderr.write(`[error] ${event.message}\n`);
                return;
            case 'step':
                this.step = event.step;
                this.maxSteps = event.maxSteps;
                return;
            case 'model':
                return;
        }
    }

    private render(label: string) {
        if (!process.stderr.isTTY) return;
        if (this.streamed) return;
        const elapsed = formatDuration(Date.now() - this.startedAt);
        const step = this.step > 0 ? `step ${this.step}/${this.maxSteps} | ` : '';
        process.stderr.write(`\r\x1b[2Kcodek | ${step}${label} | ${elapsed}`);
        this.hasStatus = true;
    }

    clear() {
        if (!this.hasStatus || !process.stderr.isTTY) return;
        process.stderr.write('\r\x1b[2K');
        this.hasStatus = false;
    }
}
