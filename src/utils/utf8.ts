export function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function utf8ByteCompare(a: string, b: string): number {
  const ab = utf8Bytes(a);
  const bb = utf8Bytes(b);
  const len = Math.min(ab.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = ab[i] - bb[i];
    if (diff !== 0) return diff;
  }
  return ab.length - bb.length;
}

export function byteArrayCompare(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}
