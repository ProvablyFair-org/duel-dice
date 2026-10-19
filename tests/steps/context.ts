import type { DiceBet, SeedEntry } from '../../src/types';

export interface StepResult {
  step:   number;
  name:   string;
  /** INFO: an informational step's deviation (profile policy INFORMATIONAL — the live-sample fit,
   *  adopted 2026-09-29): reported, never counted as a flag, never affects the verdict. */
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO';
  detail: string;
  /**
   * Machine-readable measurements for this step. A measured float belongs here and never
   * inside `detail`: the reproduction gate compares the committed artifact with a fresh run
   * field by field, and a string leaf can only be compared for equality — so a float rendered
   * into prose disagrees forever on any machine whose libm differs by a unit in the last
   * place, which is exactly the reader the gate exists for. `detail` states the BOUND;
   * `data` carries the measurement.
   */
  data?: Record<string, unknown>;
  /**
   * For a FLAG only. `capture` = an auditor-side capture artefact (a retry / connection drop
   * reconstructed via commit-reveal); it is disclosed as a limitation and is verdict-neutral —
   * a Full Pass survives it, and verify exits 0. `operator` (the default when a FLAG carries no
   * origin) = a residual about the game itself → Conditional Pass, exit 2. Rule adopted
   * 2026-09-22 (QA on PLINKO-04, ported to Dice for DICE-04): a reconstructed nonce is a
   * capture-origin FLAG, not a PASS, but does not count against the verdict.
   */
  origin?: 'capture' | 'operator';
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
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO',
  detail: string,
  data?:  Record<string, unknown>,
  origin?: 'capture' | 'operator',
): StepResult {
  const tag = status === 'PASS' ? '[PASS]'
    : status === 'INFO' ? '[INFO]'
    : status === 'FLAG' ? (origin === 'capture' ? '[FLAG⚑]' : '[FLAG]')
    : '[FAIL]';
  console.log(`  ${tag} Step ${num} — ${name}`);
  if (status !== 'PASS') console.log(`         ${detail}`);
  const base: StepResult = { step: num, name, status, detail };
  if (data !== undefined) base.data = data;
  if (origin !== undefined) base.origin = origin;
  return base;
}
