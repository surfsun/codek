import { type Dirent, promises as fs } from 'fs';
import path from 'path';

function globToRegex(pattern: string): RegExp {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        result += '(.*/)?';
        i += 3;
      } else {
        result += '.*';
        i += 2;
      }
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else if (ch === '.') {
      result += '\\.';
      i++;
    } else if (ch === '{') {
      const end = pattern.indexOf('}', i);
      if (end !== -1) {
        const parts = pattern.slice(i + 1, end).split(',').map(s => s.trim());
        result += `(${parts.join('|')})`;
        i = end + 1;
      } else {
        result += `\\{`;
        i++;
      }
    } else if ('+^${}()|[\\]'.includes(ch)) {
      result += `\\${ch}`;
      i++;
    } else {
      result += ch;
      i++;
    }
  }

  return new RegExp(`^${result}$`);
}

function extractRoot(pattern: string): string {
  const idx = pattern.search(/[*?{[]/);
  if (idx === -1) {
    const dir = path.dirname(pattern);
    return dir === '.' ? '.' : dir;
  }
  const slashIdx = pattern.lastIndexOf('/', idx);
  return slashIdx === -1 ? '.' : pattern.slice(0, slashIdx) || '.';
}

export async function globFiles(cwd: string, pattern: string): Promise<string> {
  pattern = pattern.replace(/\\/g, '/');
  if (!pattern) return '(empty)';

  const regex = globToRegex(pattern);
  const root = extractRoot(pattern);
  const results: string[] = [];
  const cwdAbs = path.resolve(cwd);

  const rootAbs = path.resolve(cwdAbs, root);
  const rootRel = path.relative(cwdAbs, rootAbs);
  if (rootRel.startsWith('..') || path.isAbsolute(rootRel)) {
    return 'Error: Pattern escapes working directory';
  }

  async function walk(dir: string) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(cwdAbs, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (regex.test(rel + '/')) results.push(rel + '/');
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (regex.test(rel)) results.push(rel);
      }
    }
  }

  await walk(rootAbs);

  return results.length > 0 ? results.join('\n') : '(no matches)';
}
