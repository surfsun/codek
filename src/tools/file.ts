import * as fs from 'fs';

export function readFile(path: string) {
    return fs.readFileSync(path, 'utf-8');
}

export function writeFile(path: string, content: string) {
    fs.writeFileSync(path, content);
    return 'file written';
}