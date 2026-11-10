import { describe, expect, it } from 'vitest';
import { parseSse } from '../public/sse.js';

describe('parseSse', () => {
  it('extracts content deltas from complete frames', () => {
    const buf = 'data: {"choices":[{"delta":{"content":"Yes"}}]}\n\ndata: {"choices":[{"delta":{"content":" it is"}}]}\n';
    const r = parseSse(buf);
    expect(r.deltas).toEqual(['Yes', ' it is']);
    expect(r.done).toBe(false);
  });
  it('keeps a frame split across chunks until its newline arrives', () => {
    const first = parseSse('data: {"choices":[{"delta":{"con');
    expect(first.deltas).toEqual([]);
    const second = parseSse(first.rest + 'tent":"Hi"}}]}\n');
    expect(second.deltas).toEqual(['Hi']);
  });
  it('marks the stream done on [DONE]', () => {
    expect(parseSse('data: [DONE]\n').done).toBe(true);
  });
  it('skips malformed frames without throwing', () => {
    const r = parseSse('data: {not json\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n');
    expect(r.deltas).toEqual(['ok']);
  });
  it('ignores empty and role-only deltas', () => {
    const r = parseSse('data: {"choices":[{"delta":{"role":"assistant"}}]}\ndata: {"choices":[{"delta":{"content":""}}]}\n');
    expect(r.deltas).toEqual([]);
  });
});
