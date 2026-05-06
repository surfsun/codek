import path from 'path';
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
