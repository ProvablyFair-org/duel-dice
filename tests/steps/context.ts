import type { DiceBet, SeedEntry } from '../../src/types';

export interface StepResult {
  step:   number;
  name:   string;
  status: 'PASS' | 'FLAG' | 'FAIL';
  detail: string;
}

export interface InfoItem {
  label:  string;
  detail: string;
}

export interface VerifyContext {
  bets:       DiceBet[];
  seeds:      SeedEntry[];
  seedMap:    Map<string, string>;
  byHash:     Map<string, DiceBet[]>;
  phaseA:     DiceBet[];
  phaseB:     DiceBet[];
  phaseC:     DiceBet[];
  phaseD:     DiceBet[];
  outputsDir: string;
  // Mutable accumulators
  step5Mismatches: number;
  step5Skipped:    number;
  chiResultsLog:   Record<string, unknown>[];
}

export function step(
  num:    number,
  name:   string,
  status: 'PASS' | 'FLAG' | 'FAIL',
  detail: string,
): StepResult {
  const tag = status === 'PASS' ? '[PASS]' : status === 'FLAG' ? '[FLAG]' : '[FAIL]';
  console.log(`  ${tag} Step ${num} — ${name}`);
  if (status !== 'PASS') console.log(`         ${detail}`);
  return { step: num, name, status, detail };
}
