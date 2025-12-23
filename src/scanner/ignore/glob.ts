function escapeRegex(text: string): string {
  return text.replace(/[.+^${}()|\\]/g, '\\$&');
}

export function globToRegExp(pattern: string, anchored: boolean): RegExp {
  let allowTrailing = false;
  if (pattern.endsWith('/**')) {
    pattern = pattern.slice(0, -3);
    allowTrailing = true;
  }
  let i = 0;
  let out = '';
  const push = (s: string) => {
    out += s;
  };

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next) {
        push(escapeRegex(next));
        i += 2;
      } else {
        push('\\\\');
        i += 1;
      }
      continue;
    }
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        push('.*');
        i += 2;
      } else {
        push('[^/]*');
        i += 1;
      }
      continue;
    }
    if (ch === '?') {
      push('[^/]');
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) {
        push('\\[');
        i += 1;
        continue;
      }
      const content = pattern.slice(i + 1, end);
      const safe = content.replace(/\\/g, '\\\\');
      push(`[${safe}]`);
      i = end + 1;
      continue;
    }
    push(escapeRegex(ch));
    i += 1;
  }

  const prefix = anchored ? '^' : '^(?:.*\/)?';
  const suffix = allowTrailing ? '(?:/.*)?' : '';
  return new RegExp(`${prefix}${out}${suffix}$`);
}
