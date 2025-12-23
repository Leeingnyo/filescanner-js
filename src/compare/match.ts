import type { NodeMeta } from '../types/nodeMeta.js';
import { EvidenceOutcome, EvidenceType, MatchResult, Verdict, Confidence, type IdentityPolicy, ConflictHandling } from '../types/compare.js';
import { vpathKey } from '../vpath/key.js';
import { asciiFold } from '../utils/asciiFold.js';
import { identityValue } from '../node/identityKey.js';
import { CasePolicy } from '../types/enums.js';

function compareString(left?: string, right?: string, casePolicy?: CasePolicy): EvidenceOutcome {
  if (left === undefined) return EvidenceOutcome.MISSING_LEFT;
  if (right === undefined) return EvidenceOutcome.MISSING_RIGHT;
  const l = casePolicy === CasePolicy.INSENSITIVE ? asciiFold(left) : left;
  const r = casePolicy === CasePolicy.INSENSITIVE ? asciiFold(right) : right;
  return l === r ? EvidenceOutcome.MATCH : EvidenceOutcome.MISMATCH;
}

function pickHash(node: NodeMeta): { algo: string; value: string } | undefined {
  const entries = Object.values(node.hashes ?? {}).filter((h) => h.status === 'PRESENT' && h.value);
  if (entries.length === 0) return undefined;
  const preferred = entries.find((h) => h.algo === 'sha256');
  const hash = preferred ?? entries[0];
  return { algo: hash.algo, value: hash.value as string };
}

export function matchNodes(left: NodeMeta, right: NodeMeta, policy: IdentityPolicy, resolvedCase: CasePolicy): MatchResult {
  const evidence = policy.strategies.map((strategy) => {
    let outcome: EvidenceOutcome = EvidenceOutcome.NOT_APPLICABLE;
    let leftValue: string | undefined;
    let rightValue: string | undefined;

    switch (strategy.type) {
      case EvidenceType.OS_FILE_ID: {
        leftValue = identityValue(left.identity) ?? undefined;
        rightValue = identityValue(right.identity) ?? undefined;
        outcome = compareString(leftValue, rightValue);
        break;
      }
      case EvidenceType.VPATH: {
        leftValue = vpathKey(left.ref.vpath, resolvedCase);
        rightValue = vpathKey(right.ref.vpath, resolvedCase);
        outcome = compareString(leftValue, rightValue, resolvedCase);
        break;
      }
      case EvidenceType.NAME: {
        leftValue = left.name;
        rightValue = right.name;
        outcome = compareString(leftValue, rightValue, resolvedCase);
        break;
      }
      case EvidenceType.SIZE: {
        if (left.size === undefined) outcome = EvidenceOutcome.MISSING_LEFT;
        else if (right.size === undefined) outcome = EvidenceOutcome.MISSING_RIGHT;
        else outcome = left.size === right.size ? EvidenceOutcome.MATCH : EvidenceOutcome.MISMATCH;
        leftValue = left.size?.toString();
        rightValue = right.size?.toString();
        break;
      }
      case EvidenceType.MTIME: {
        leftValue = left.mtime;
        rightValue = right.mtime;
        outcome = compareString(leftValue, rightValue);
        break;
      }
      case EvidenceType.CONTENT_HASH: {
        const leftHash = pickHash(left);
        const rightHash = pickHash(right);
        leftValue = leftHash ? `${leftHash.algo}:${leftHash.value}` : undefined;
        rightValue = rightHash ? `${rightHash.algo}:${rightHash.value}` : undefined;
        outcome = compareString(leftValue, rightValue);
        break;
      }
      case EvidenceType.PERCEPTUAL_HASH: {
        const leftHash = Object.values(left.hashes ?? {}).find((h) => h.algo.startsWith('p') && h.value);
        const rightHash = Object.values(right.hashes ?? {}).find((h) => h.algo.startsWith('p') && h.value);
        leftValue = leftHash ? `${leftHash.algo}:${leftHash.value}` : undefined;
        rightValue = rightHash ? `${rightHash.algo}:${rightHash.value}` : undefined;
        outcome = compareString(leftValue, rightValue);
        break;
      }
      default:
        outcome = EvidenceOutcome.NOT_APPLICABLE;
    }

    return { type: strategy.type, outcome, leftValue, rightValue, weight: strategy.weight };
  });

  const matchScore = evidence.reduce((sum, ev) => sum + (ev.outcome === EvidenceOutcome.MATCH ? ev.weight : 0), 0);
  const mismatchScore = evidence.reduce((sum, ev) => sum + (ev.outcome === EvidenceOutcome.MISMATCH ? ev.weight : 0), 0);

  const thresholds = policy.thresholds;
  const strongConflict = matchScore >= thresholds.sameLikely && mismatchScore >= thresholds.differentCertain;
  if (strongConflict && policy.conflictHandling === ConflictHandling.MARK_CONFLICT) {
    return { verdict: Verdict.UNKNOWN, confidence: Confidence.POSSIBLE, evidence };
  }

  const hashEvidence = evidence.find((ev) => ev.type === EvidenceType.CONTENT_HASH);
  if (hashEvidence && hashEvidence.outcome === EvidenceOutcome.MISMATCH && hashEvidence.weight >= thresholds.differentCertain) {
    return { verdict: Verdict.DIFFERENT, confidence: Confidence.CERTAIN, evidence };
  }

  if (mismatchScore >= thresholds.differentCertain) {
    return { verdict: Verdict.DIFFERENT, confidence: Confidence.CERTAIN, evidence };
  }
  if (matchScore >= thresholds.sameCertain && mismatchScore === 0) {
    return { verdict: Verdict.SAME, confidence: Confidence.CERTAIN, evidence };
  }
  if (matchScore >= thresholds.sameLikely && mismatchScore < thresholds.differentCertain) {
    return { verdict: Verdict.POSSIBLY_SAME, confidence: Confidence.LIKELY, evidence };
  }
  return { verdict: Verdict.UNKNOWN, confidence: Confidence.POSSIBLE, evidence };
}
