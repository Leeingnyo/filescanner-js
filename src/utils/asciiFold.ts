export function asciiFold(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0x41 && code <= 0x5a) {
      out += String.fromCharCode(code + 0x20);
    } else {
      out += value[i];
    }
  }
  return out;
}
