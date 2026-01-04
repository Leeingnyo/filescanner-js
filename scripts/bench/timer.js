import { performance } from 'node:perf_hooks';

export async function measureAsync(label, fn) {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { label, ms: end - start, result };
}

export function formatMs(ms) {
  return `${ms.toFixed(2)}ms`;
}
