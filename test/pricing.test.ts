import { describe, expect, it } from 'vitest';
import { PRICE_CENTS_PER_MILLION, priceCents } from '../src/pricing';

describe('priceCents', () => {
  it('charges $1.00 per million tokens at the agreed rate', () => {
    expect(PRICE_CENTS_PER_MILLION).toBe(100);
    expect(priceCents(1_000_000)).toBe(100);
  });
  it('prices the starter pack: 100,000 tokens for 10 cents', () => {
    expect(priceCents(100_000)).toBe(10);
  });
  it('rounds up so a small purchase never prices at zero', () => {
    expect(priceCents(1)).toBe(1);
  });
  it('rejects zero, negative and non-integer token counts', () => {
    expect(() => priceCents(0)).toThrow('invalid_amount');
    expect(() => priceCents(-10)).toThrow('invalid_amount');
    expect(() => priceCents(1.5)).toThrow('invalid_amount');
  });
});
