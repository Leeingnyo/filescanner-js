import { createRequire } from 'node:module';

export type CompiledRegex = {
  test(text: string): boolean;
};

type Re2Ctor = new (pattern: string) => CompiledRegex;

let cachedRe2Ctor: Re2Ctor | null | undefined;

function loadRe2Ctor(): Re2Ctor | null {
  if (cachedRe2Ctor !== undefined) return cachedRe2Ctor;
  try {
    const require = createRequire(import.meta.url);
    const mod = require('re2') as { default?: Re2Ctor } | Re2Ctor;
    cachedRe2Ctor = (typeof mod === 'function' ? mod : mod.default) ?? null;
  } catch {
    cachedRe2Ctor = null;
  }
  return cachedRe2Ctor;
}

export function compileRegex(pattern: string): CompiledRegex {
  const RE2 = loadRe2Ctor();
  if (RE2) return new RE2(pattern);
  return new RegExp(pattern);
}

