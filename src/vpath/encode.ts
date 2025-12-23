const UNRESERVED = new Set<number>([
  ...range(0x41, 0x5a),
  ...range(0x61, 0x7a),
  ...range(0x30, 0x39),
  0x2d,
  0x2e,
  0x5f,
  0x7e
]);

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

function toUpperHex(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

export function encodeVPathSegment(segment: string): string {
  const bytes = new TextEncoder().encode(segment);
  let out = '';
  for (const byte of bytes) {
    if (UNRESERVED.has(byte)) {
      out += String.fromCharCode(byte);
    } else {
      out += `%${toUpperHex(byte)}`;
    }
  }
  return out;
}

export function encodeVPathSegments(segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }
  return `/${segments.map(encodeVPathSegment).join('/')}`;
}
