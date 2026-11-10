import { describe, expect, it } from 'vitest';
import { healthBody } from '../src/index';

describe('healthBody', () => {
  it('reports ok with no model configured', () => {
    expect(healthBody(null)).toEqual({ ok: true, model: null });
  });
  it('echoes the configured model name', () => {
    expect(healthBody('qwen3.5-4b-q4_k_m')).toEqual({ ok: true, model: 'qwen3.5-4b-q4_k_m' });
  });
});
