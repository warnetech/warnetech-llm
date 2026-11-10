// Parses an OpenAI-style SSE stream chunk by chunk. Keeps any partial line in `rest`
// so a token split across network chunks is never dropped.
export function parseSse(buffer) {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const deltas = [];
  let done = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') {
      done = true;
      continue;
    }
    try {
      const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text !== '') deltas.push(text);
    } catch {
      // A malformed frame is skipped, not fatal: the next frame still arrives intact.
    }
  }
  return { deltas, done, rest };
}
