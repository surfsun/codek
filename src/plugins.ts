export type Plugin = {
    name: string;
    tools: Record<string, (input: any) => Promise<any> | any>;
};

const plugins: Plugin[] = [];

export function registerPlugin(plugin: Plugin) {
    plugins.push(plugin);
}

export function getTool(name: string) {
    for (const p of plugins) {
        if (p.tools[name]) return p.tools[name];
    }
    return null;
}

export function listPlugins() {
    return plugins.map(p => p.name);
}