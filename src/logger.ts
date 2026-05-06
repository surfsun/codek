import { appendFileSync, mkdirSync } from 'fs';
import path from 'path';

let verbose = false;
let logEnabled = false;
let eventsPath = '';
let llmPath = '';

export type LoggerConfig = {
    enabled: boolean;
    logDir: string;
    sessionId: string;
};

export function configureLogger(config: LoggerConfig) {
    logEnabled = config.enabled;
    if (!logEnabled) return;

    const sessionDir = path.join(config.logDir, config.sessionId);
    mkdirSync(sessionDir, { recursive: true });
    eventsPath = path.join(sessionDir, 'events.jsonl');
    llmPath = path.join(sessionDir, 'llm.jsonl');
}

export function setVerbose(value: boolean) {
    verbose = value;
}

export function getVerbose() {
    return verbose;
}

function write(stream: NodeJS.WriteStream, label: string, msg: string) {
    stream.write(`[${label}] ${msg}\n`);
}

function writeJsonLine(filePath: string, record: Record<string, unknown>) {
    if (!logEnabled || !filePath) return;

    try {
        appendFileSync(filePath, `${JSON.stringify({
            time: new Date().toISOString(),
            ...record,
        })}\n`, 'utf-8');
    } catch {
        // Logging must never break the agent path.
    }
}

export const logger = {
    info(msg: string) {
        if (verbose) write(process.stderr, 'info', msg);
        writeJsonLine(eventsPath, { level: 'info', message: msg });
    },

    step(msg: string) {
        if (verbose) write(process.stderr, 'step', msg);
        writeJsonLine(eventsPath, { level: 'step', message: msg });
    },

    tool(msg: string) {
        if (verbose) write(process.stderr, 'tool', msg);
        writeJsonLine(eventsPath, { level: 'tool', message: msg });
    },

    warn(msg: string) {
        if (verbose) write(process.stderr, 'warn', msg);
        writeJsonLine(eventsPath, { level: 'warn', message: msg });
    },

    error(msg: string) {
        if (verbose) write(process.stderr, 'error', msg);
        writeJsonLine(eventsPath, { level: 'error', message: msg });
    },

    event(type: string, data: Record<string, unknown> = {}) {
        writeJsonLine(eventsPath, { type, ...data });
    },

    llm(type: string, data: Record<string, unknown>) {
        writeJsonLine(llmPath, { type, ...data });
    },
};
