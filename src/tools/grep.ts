import { type Dirent, promises as fs } from 'fs';
import path from 'path';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.o', '.a', '.lib', '.obj',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv',
  '.db', '.sqlite', '.sqlite3',
]);

function isBinaryExt(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function createFileFilter(include?: string): ((name: string) => boolean) | null {
  if (!include || include === '*') return null;

  if (include.startsWith('*.')) {
    const ext = include.slice(1).toLowerCase();
    return name => name.toLowerCase().endsWith(ext);
  }

  if (include.startsWith('.')) {
    const ext = include.toLowerCase();
    return name => name.toLowerCase().endsWith(ext);
  }

  let re = '';
  for (const ch of include) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if ('.+^${}()|[\\]'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  const regex = new RegExp(re, 'i');
  return name => regex.test(name);
}

export async function grepFiles(
  cwd: string,
  pattern: string,
  searchPath?: string,
  include?: string,
): Promise<string> {
  const cwdAbs = path.resolve(cwd);
  let rootAbs = cwdAbs;

  if (searchPath) {
    rootAbs = path.resolve(cwdAbs, searchPath);
    const rel = path.relative(cwdAbs, rootAbs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return 'Error: Search path escapes working directory';
    }
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'm');
  } catch {
    return `Error: Invalid regex pattern: ${pattern}`;
  }

  const filter = createFileFilter(include);
  const results: string[] = [];
  const MAX_MATCHES = 200;

  async function walk(dir: string) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_MATCHES) return;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isBinaryExt(fullPath)) continue;
        if (filter && !filter(entry.name)) continue;

        const relPath = path.relative(cwdAbs, fullPath);

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${relPath}:${i + 1}:${lines[i].trim().slice(0, 200)}`);
              if (results.length >= MAX_MATCHES) return;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(rootAbs);

  if (results.length === 0) return '(no matches)';
  return results.join('\n');
}
