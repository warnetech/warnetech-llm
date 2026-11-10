export interface SseResult {
  deltas: string[];
  done: boolean;
  rest: string;
}
export function parseSse(buffer: string): SseResult;
