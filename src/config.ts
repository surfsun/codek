export type CodekConfig = {
    model: string;
    maxSteps: number;
    allowDangerousCommands: boolean;
};

const defaultConfig: CodekConfig = {
    model: 'google/gemma-4-e4b',
    maxSteps: 20,
    allowDangerousCommands: false,
};

let config = { ...defaultConfig };

export function getConfig(): CodekConfig {
    return config;
}

export function setConfig(partial: Partial<CodekConfig>) {
    config = { ...config, ...partial };
}