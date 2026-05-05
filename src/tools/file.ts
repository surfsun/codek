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

export async function editFile(cwd: string, requestedPath: string, search: string, replace: string) {
    if (!search) {
        throw new Error('Search text must not be empty.');
    }

    const filePath = resolveInsideCwd(cwd, requestedPath);
    const content = await fs.readFile(filePath, 'utf-8');
    const first = content.indexOf(search);

    if (first < 0) {
        throw new Error(`Search text not found in ${requestedPath}`);
    }

    if (content.indexOf(search, first + search.length) >= 0) {
        throw new Error(`Search text is not unique in ${requestedPath}`);
    }

    const next = `${content.slice(0, first)}${replace}${content.slice(first + search.length)}`;
    await fs.writeFile(filePath, next, 'utf-8');
    return `Edited ${path.relative(cwd, filePath)}`;
}
