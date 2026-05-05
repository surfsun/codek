import path from 'path';
import { loadDotEnv } from './env.js';

loadDotEnv();

export type CodekConfig = {
    model: string;
    maxSteps: number;
    cwd: string;
    apiKey: string;
    baseURL: string;
    shellApprovalMode: ShellApprovalMode;
    verbose: boolean;
};

export type ShellApprovalMode = 'ask' | 'model' | 'allow';

export function parseShellApprovalMode(value: string | undefined): ShellApprovalMode | undefined {
    if (!value) return undefined;

    if (value === 'ask' || value === 'model' || value === 'allow') {
        return value;
    }

    throw new Error(`Invalid shell approval mode: ${value}`);
}

const defaultConfig: CodekConfig = {
    model: process.env.CODEK_MODEL || process.env.OPENAI_MODEL || 'google/gemma-4-e4b',
    maxSteps: Number(process.env.CODEK_MAX_STEPS || 20),
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
