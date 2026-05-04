import { existsSync, readFileSync } from 'fs';
import path from 'path';

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

export function loadDotEnv(cwd = process.cwd()) {
    const envPath = path.join(cwd, '.env');
    if (!existsSync(envPath)) return;

    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;

        const key = trimmed.slice(0, separator).trim();
        const value = parseEnvValue(trimmed.slice(separator + 1));

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}
