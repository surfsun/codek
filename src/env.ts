import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

const initialEnvKeys = new Set(Object.keys(process.env));

function parseEnvValue(value: string) {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function resolveEnvPath(envPath: string) {
    if (envPath === '~') {
        return os.homedir();
    }
    if (envPath.startsWith(`~${path.sep}`) || envPath.startsWith('~/') || envPath.startsWith('~\\')) {
        return path.join(os.homedir(), envPath.slice(2));
    }
    return path.resolve(envPath);
}

function loadEnvFile(envPath: string) {
    if (!existsSync(envPath)) return;

    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('export ')) {
            trimmed = trimmed.slice('export '.length).trim();
        }

        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;

        const key = trimmed.slice(0, separator).trim();
        const value = parseEnvValue(trimmed.slice(separator + 1));

        if (!initialEnvKeys.has(key)) {
            process.env[key] = value;
        }
    }
}

export function getDotEnvPaths(cwd = process.cwd(), explicitEnvPath?: string) {
    const paths = [
        path.join(os.homedir(), '.codek', '.env'),
        path.join(path.resolve(cwd), '.env'),
    ];

    if (process.env.CODEK_ENV_PATH) {
        paths.push(resolveEnvPath(process.env.CODEK_ENV_PATH));
    }
    if (explicitEnvPath) {
        paths.push(resolveEnvPath(explicitEnvPath));
    }

    return [...new Set(paths)];
}

export function loadDotEnv(cwd = process.cwd(), explicitEnvPath?: string) {
    for (const envPath of getDotEnvPaths(cwd, explicitEnvPath)) {
        loadEnvFile(envPath);
    }
}
