export function parseArgs(argv, defaults = {}) {
  const args = { ...defaults };
  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [flag, inlineValue] = raw.slice(2).split('=');
    let value = inlineValue;
    if (value === undefined && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      value = argv[i + 1];
      i += 1;
    }
    if (value === undefined) {
      args[flag] = true;
      continue;
    }
    args[flag] = coerceValue(value);
  }
  return args;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!Number.isNaN(Number(value)) && value.trim() !== '') return Number(value);
  return value;
}
