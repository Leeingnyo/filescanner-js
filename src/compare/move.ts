import type { NodeMeta } from '../types/nodeMeta.js';
import { Confidence, EvidenceOutcome, EvidenceType, MovePolicy, Verdict, type IdentityPolicy } from '../types/compare.js';
import { matchNodes } from './match.js';
import { toCanonicalString } from '../node/canonical.js';
import { CasePolicy } from '../types/enums.js';

export interface MovePair {
  left: NodeMeta;
  right: NodeMeta;
  match: ReturnType<typeof matchNodes>;
}

interface Candidate {
  left: NodeMeta;
  right: NodeMeta;
  match: ReturnType<typeof matchNodes>;
  verdictPriority: number;
  confidencePriority: number;
  matchScore: number;
  mismatchScore: number;
  strategyIndex: number;
  leftCanon: string;
  rightCanon: string;
}

function buildMovePolicy(identity: IdentityPolicy, move: MovePolicy): IdentityPolicy {
  const strategies = identity.strategies.filter((s) => move.strategies.includes(s.type));
  const fallback = move.strategies
    .filter((t) => !strategies.some((s) => s.type === t))
    .map((t) => ({ type: t, weight: 1 }));
  return {
    ...identity,
    strategies: [...strategies, ...fallback]
  };
}

function confidenceRank(confidence: Confidence): number {
  if (confidence === Confidence.CERTAIN) return 3;
  if (confidence === Confidence.LIKELY) return 2;
  return 1;
}

function verdictRank(verdict: Verdict): number {
  return verdict === Verdict.SAME ? 2 : verdict === Verdict.POSSIBLY_SAME ? 1 : 0;
}

export function detectMoves(
  leftOnly: NodeMeta[],
  rightOnly: NodeMeta[],
  identity: IdentityPolicy,
  move: MovePolicy,
  casePolicy: CasePolicy
): MovePair[] {
  if (!move.enabled) return [];
  const policy = buildMovePolicy(identity, move);
  const candidates: Candidate[] = [];

  for (const left of leftOnly) {
    for (const right of rightOnly) {
      const match = matchNodes(left, right, policy, casePolicy);
      if ((match.verdict !== Verdict.SAME && match.verdict !== Verdict.POSSIBLY_SAME) || confidenceRank(match.confidence) < confidenceRank(move.minConfidence)) {
        continue;
      }
      const matchScore = match.evidence.reduce((sum, ev) => sum + (ev.outcome === EvidenceOutcome.MATCH ? ev.weight : 0), 0);
      const mismatchScore = match.evidence.reduce((sum, ev) => sum + (ev.outcome === EvidenceOutcome.MISMATCH ? ev.weight : 0), 0);
      const strategyIndex = policy.strategies.findIndex((s) => match.evidence.some((ev) => ev.type === s.type && ev.outcome === EvidenceOutcome.MATCH));
      candidates.push({
        left,
        right,
        match,
        verdictPriority: verdictRank(match.verdict),
        confidencePriority: confidenceRank(match.confidence),
        matchScore,
        mismatchScore,
        strategyIndex: strategyIndex === -1 ? Number.MAX_SAFE_INTEGER : strategyIndex,
        leftCanon: toCanonicalString(left.ref),
        rightCanon: toCanonicalString(right.ref)
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.verdictPriority !== b.verdictPriority) return b.verdictPriority - a.verdictPriority;
    if (a.confidencePriority !== b.confidencePriority) return b.confidencePriority - a.confidencePriority;
    if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
    if (a.mismatchScore !== b.mismatchScore) return a.mismatchScore - b.mismatchScore;
    if (a.strategyIndex !== b.strategyIndex) return a.strategyIndex - b.strategyIndex;
    if (a.leftCanon !== b.leftCanon) return a.leftCanon < b.leftCanon ? -1 : 1;
    if (a.rightCanon !== b.rightCanon) return a.rightCanon < b.rightCanon ? -1 : 1;
    return 0;
  });

  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();
  const selected: MovePair[] = [];
  for (const candidate of candidates) {
    const leftId = candidate.left.nodeId;
    const rightId = candidate.right.nodeId;
    if (usedLeft.has(leftId) || usedRight.has(rightId)) continue;
    usedLeft.add(leftId);
    usedRight.add(rightId);
    selected.push({ left: candidate.left, right: candidate.right, match: candidate.match });
  }
  return selected;
}
