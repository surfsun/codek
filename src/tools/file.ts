import { promises as fs } from 'fs';
import path from 'path';

export function resolveInsideCwd(cwd: string, requestedPath = '.') {
    const absolute = path.resolve(cwd, requestedPath);
    const relative = path.relative(cwd, absolute);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path is outside cwd: ${requestedPath}`);
    }

    return absolute;
}

export async function readFile(cwd: string, requestedPath: string) {
    const filePath = resolveInsideCwd(cwd, requestedPath);
    return fs.readFile(filePath, 'utf-8');
}

export async function writeFile(cwd: string, requestedPath: string, content: string) {
    const filePath = resolveInsideCwd(cwd, requestedPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return `Wrote ${path.relative(cwd, filePath)}`;
}

export async function listFiles(cwd: string, requestedPath = '.', depth = 2) {
    const root = resolveInsideCwd(cwd, requestedPath);
    const entries: string[] = [];

    async function walk(current: string, currentDepth: number) {
        if (currentDepth > depth) return;

        const dirents = await fs.readdir(current, { withFileTypes: true });
        for (const dirent of dirents) {
            if (dirent.name === 'node_modules' || dirent.name === '.git' || dirent.name === 'dist') continue;

            const absolute = path.join(current, dirent.name);
            const relative = path.relative(cwd, absolute);
            entries.push(dirent.isDirectory() ? `${relative}/` : relative);

            if (dirent.isDirectory()) {
                await walk(absolute, currentDepth + 1);
            }
        }
    }

    await walk(root, 0);
    return entries.join('\n') || '(empty)';
}
