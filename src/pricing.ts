/** Agreed rate: $1.00 per million tokens, stored in integer cents to avoid float error at checkout. */
export const PRICE_CENTS_PER_MILLION = 100;

/** Price in cents for a token count, rounded up so any purchase costs at least one cent. */
export function priceCents(tokens: number): number {
  if (!Number.isInteger(tokens) || tokens <= 0) throw new Error('invalid_amount');
  return Math.ceil((tokens * PRICE_CENTS_PER_MILLION) / 1_000_000);
}
