/**
 * Token ledger: grants (purchases) and debits (usage) keyed by an idempotency key.
 * Pure functions, no I/O, so the money rules are testable without a database.
 * Balance is derived from entries, never stored, so it cannot drift from the history.
 */
export interface Entry {
  /** Idempotency key: a payment id for grants, a request id for debits. */
  key: string;
  kind: 'grant' | 'debit';
  tokens: number;
}

export type LedgerResult =
  | { ok: true; duplicate: boolean; entries: Entry[] }
  | { ok: false; error: 'invalid_amount' | 'insufficient_tokens' };

export function balanceOf(entries: readonly Entry[]): number {
  return entries.reduce((sum, e) => sum + (e.kind === 'grant' ? e.tokens : -e.tokens), 0);
}

function validAmount(tokens: number): boolean {
  return Number.isInteger(tokens) && tokens > 0;
}

function hasKey(entries: readonly Entry[], key: string): boolean {
  return entries.some((e) => e.key === key);
}

export function applyGrant(entries: readonly Entry[], key: string, tokens: number): LedgerResult {
  if (!validAmount(tokens)) return { ok: false, error: 'invalid_amount' };
  if (hasKey(entries, key)) return { ok: true, duplicate: true, entries: [...entries] };
  return { ok: true, duplicate: false, entries: [...entries, { key, kind: 'grant', tokens }] };
}

export function applyDebit(entries: readonly Entry[], key: string, tokens: number): LedgerResult {
  if (!validAmount(tokens)) return { ok: false, error: 'invalid_amount' };
  // A retried request must return the original outcome, not fail for lack of balance it already spent.
  if (hasKey(entries, key)) return { ok: true, duplicate: true, entries: [...entries] };
  if (balanceOf(entries) < tokens) return { ok: false, error: 'insufficient_tokens' };
  return { ok: true, duplicate: false, entries: [...entries, { key, kind: 'debit', tokens }] };
}
