import { describe, expect, it } from 'vitest';
import { applyDebit, applyGrant, balanceOf, type Entry } from '../src/ledger';

describe('balanceOf', () => {
  it('is zero for an empty ledger', () => {
    expect(balanceOf([])).toBe(0);
  });
  it('sums grants and subtracts debits', () => {
    const entries: Entry[] = [
      { key: 'g1', kind: 'grant', tokens: 100 },
      { key: 'd1', kind: 'debit', tokens: 30 },
    ];
    expect(balanceOf(entries)).toBe(70);
  });
});

describe('applyGrant', () => {
  it('appends a grant', () => {
    const r = applyGrant([], 'pay_1', 500);
    expect(r).toEqual({ ok: true, duplicate: false, entries: [{ key: 'pay_1', kind: 'grant', tokens: 500 }] });
  });
  it('is idempotent: the same key twice credits once', () => {
    const first = applyGrant([], 'pay_1', 500);
    if (!first.ok) throw new Error('setup');
    const second = applyGrant(first.entries, 'pay_1', 500);
    if (!second.ok) throw new Error('unexpected');
    expect(second.duplicate).toBe(true);
    expect(balanceOf(second.entries)).toBe(500);
  });
  it('rejects zero, negative and non-integer amounts', () => {
    expect(applyGrant([], 'x', 0)).toEqual({ ok: false, error: 'invalid_amount' });
    expect(applyGrant([], 'x', -5)).toEqual({ ok: false, error: 'invalid_amount' });
    expect(applyGrant([], 'x', 1.5)).toEqual({ ok: false, error: 'invalid_amount' });
  });
});

describe('applyDebit', () => {
  const funded: Entry[] = [{ key: 'g1', kind: 'grant', tokens: 100 }];

  it('debits when balance covers the amount', () => {
    const r = applyDebit(funded, 'req_1', 40);
    expect(r.ok).toBe(true);
    if (r.ok) expect(balanceOf(r.entries)).toBe(60);
  });
  it('refuses to go negative', () => {
    expect(applyDebit(funded, 'req_1', 101)).toEqual({ ok: false, error: 'insufficient_tokens' });
  });
  it('allows spending the exact balance', () => {
    const r = applyDebit(funded, 'req_1', 100);
    if (!r.ok) throw new Error('unexpected');
    expect(balanceOf(r.entries)).toBe(0);
  });
  it('is idempotent: a retried request debits once', () => {
    const first = applyDebit(funded, 'req_1', 40);
    if (!first.ok) throw new Error('setup');
    const retry = applyDebit(first.entries, 'req_1', 40);
    if (!retry.ok) throw new Error('unexpected');
    expect(retry.duplicate).toBe(true);
    expect(balanceOf(retry.entries)).toBe(60);
  });
  it('rejects a non-positive debit', () => {
    expect(applyDebit(funded, 'req_1', 0)).toEqual({ ok: false, error: 'invalid_amount' });
  });
});
