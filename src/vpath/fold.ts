import type { VPath } from '../types/ids.js';

function isHex(char: string): boolean {
  return /[0-9A-Fa-f]/.test(char);
}

export function vpathFold(vpath: VPath): VPath {
  let out = '';
  for (let i = 0; i < vpath.length; i += 1) {
    const ch = vpath[i];
    if (ch === '%' && i + 2 < vpath.length && isHex(vpath[i + 1]) && isHex(vpath[i + 2])) {
      out += vpath.slice(i, i + 3);
      i += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code >= 0x41 && code <= 0x5a) {
      out += String.fromCharCode(code + 0x20);
    } else {
      out += ch;
    }
  }
  return out as VPath;
}
