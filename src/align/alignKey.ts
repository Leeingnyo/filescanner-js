import type { NodeMeta } from '../types/nodeMeta.js';
import type { AlignKeyStrategy } from '../types/align.js';
import { AlignKeyType } from '../types/align.js';
import { sha256HexUtf8 } from '../utils/crypto.js';
import { vpathKey } from '../vpath/key.js';
import { identityValue } from '../node/identityKey.js';
import { CasePolicy } from '../types/enums.js';

const SEP = '\u001f';

function hashInput(strategyName: string, input: string): string {
  return `rk:${sha256HexUtf8(`align:${strategyName}${SEP}${input}`)}`;
}

function hashValue(node: NodeMeta): string {
  const entries = Object.values(node.hashes ?? {}).filter((h) => h.status === 'PRESENT' && h.value);
  if (entries.length === 0) return '';
  const preferred = entries.find((h) => h.algo === 'sha256');
  const hash = preferred ?? entries[0];
  return `hash:${hash.algo}:${hash.value}`;
}

export function buildRowKey(node: NodeMeta, strategy: AlignKeyStrategy, casePolicy: CasePolicy): { rowKey: string; displayKey: string } {
  if (strategy.type === AlignKeyType.COMPOSITE) {
    const parts = (strategy.parts ?? [AlignKeyType.ENTITY_KEY, AlignKeyType.VPATH]).map((part) => partValue(node, part, casePolicy));
    const input = parts.join(SEP);
    const rowKey = hashInput('COMPOSITE', input);
    const displayKey = (strategy.parts ?? []).includes(AlignKeyType.VPATH) ? node.ref.vpath : node.ref.vpath;
    return { rowKey, displayKey };
  }
  const input = partValue(node, strategy.type, casePolicy);
  const rowKey = hashInput(strategy.type, input);
  const displayKey = strategy.type === AlignKeyType.VPATH ? node.ref.vpath : node.ref.vpath;
  return { rowKey, displayKey };
}

function partValue(node: NodeMeta, type: AlignKeyType, casePolicy: CasePolicy): string {
  switch (type) {
    case AlignKeyType.VPATH:
      return vpathKey(node.ref.vpath, casePolicy);
    case AlignKeyType.ENTITY_KEY:
      return node.entityKey;
    case AlignKeyType.OS_FILE_ID:
      return identityValue(node.identity) ?? '';
    case AlignKeyType.CONTENT_HASH:
      return hashValue(node);
    default:
      return '';
  }
}
