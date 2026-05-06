import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { loadDotEnv } from './env.js';

loadDotEnv();

export type CodekConfig = {
    model: string;
    modelProfiles: ModelProfile[];
    maxSteps: number;
    cwd: string;
    apiKey: string;
    baseURL: string;
    shellApprovalMode: ShellApprovalMode;
    verbose: boolean;
    historyEnabled: boolean;
    historyPath: string;
    memoryEnabled: boolean;
    memoryPath: string;
    summaryEnabled: boolean;
    summaryPath: string;
};

export type ShellApprovalMode = 'ask' | 'model' | 'allow';

export type ModelProfile = {
    id: string;
    label: string;
    description?: string;
};

export const defaultModelProfiles: ModelProfile[] = [
    {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        description: 'Default balanced local-compatible model.',
    },
    {
        id: 'google/gemma-4-e4b',
        label: 'Gemma 4 E4B',
        description: 'Small local model profile used by earlier codek defaults.',
    },
    {
        id: 'gpt-4.1',
        label: 'GPT-4.1',
        description: 'General-purpose OpenAI model.',
    },
    {
        id: 'gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
        description: 'Fast, lower-cost OpenAI model.',
    },
];

function parseModelProfiles(value: string | undefined): ModelProfile[] | undefined {
    if (!value) return undefined;

    const ids = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    if (ids.length === 0) return undefined;

    return ids.map(id => ({ id, label: id }));
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback;

    const normalized = value.toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;

    throw new Error(`Invalid boolean value: ${value}`);
}

export function defaultHistoryPath(cwd: string) {
    const projectHash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return path.join(os.homedir(), '.codek', 'projects', projectHash, 'history.jsonl');
}

export function defaultMemoryPath(cwd: string) {
    const projectHash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return path.join(os.homedir(), '.codek', 'projects', projectHash, 'memory.json');
}

export function defaultSummaryPath(cwd: string) {
    const projectHash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return path.join(os.homedir(), '.codek', 'projects', projectHash, 'summaries.jsonl');
}

export function parseShellApprovalMode(value: string | undefined): ShellApprovalMode | undefined {
    if (!value) return undefined;

    if (value === 'ask' || value === 'model' || value === 'allow') {
        return value;
    }

    throw new Error(`Invalid shell approval mode: ${value}`);
}

const defaultConfig: CodekConfig = {
    model: process.env.CODEK_MODEL || process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    modelProfiles: parseModelProfiles(process.env.CODEK_MODELS) ?? defaultModelProfiles,
    maxSteps: Number(process.env.CODEK_MAX_STEPS || 50),
    cwd: path.resolve(process.cwd()),
    apiKey: process.env.OPENAI_API_KEY || 'codek-local',
    baseURL: process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1',
    shellApprovalMode: 'ask',
    verbose: false,
    historyEnabled: parseBoolean(process.env.CODEK_HISTORY, true),
    historyPath: process.env.CODEK_HISTORY_PATH || defaultHistoryPath(path.resolve(process.cwd())),
    memoryEnabled: parseBoolean(process.env.CODEK_MEMORY, true),
    memoryPath: process.env.CODEK_MEMORY_PATH || defaultMemoryPath(path.resolve(process.cwd())),
    summaryEnabled: parseBoolean(process.env.CODEK_SUMMARIES, true),
    summaryPath: process.env.CODEK_SUMMARY_PATH || defaultSummaryPath(path.resolve(process.cwd())),
};

let config = { ...defaultConfig };

export function getConfig(): CodekConfig {
    return config;
}

export function setConfig(partial: Partial<CodekConfig>) {
    const next = { ...config };

    for (const [key, value] of Object.entries(partial)) {
        if (value !== undefined) {
            Reflect.set(next, key, key === 'cwd' && typeof value === 'string' ? path.resolve(value) : value);
        }
    }

    config = next;
}

export function resetConfig() {
    config = { ...defaultConfig };
}
