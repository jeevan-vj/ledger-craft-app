const OPEN = '<|tool_call>';
const CLOSE = '<tool_call|>';
const STRING_MARK = '<|"|>';

export type GemmaToolCall = { name: string; arguments: unknown };

/** Gemma 4 emits `<|tool_call>call:name{...}<tool_call|>`, with strings wrapped in `<|"|>`. */
export function gemmaToolCallsFromText(text: string): GemmaToolCall[] {
  const calls: GemmaToolCall[] = [];
  let cursor = 0;
  let sawMarker = false;
  while (cursor < text.length) {
    const start = text.indexOf(OPEN, cursor);
    if (start < 0) break;
    sawMarker = true;
    const end = text.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) break;
    const parsed = parseCall(text.slice(start + OPEN.length, end));
    if (parsed) calls.push({ name: parsed.name, arguments: parsed.arguments });
    cursor = end + CLOSE.length;
  }
  if (sawMarker) return calls;
  const trimmed = text.trim();
  const bare = parseCall(trimmed);
  if (!bare || trimmed.slice(bare.consumed).trim().length > 0) return [];
  return [{ name: bare.name, arguments: bare.arguments }];
}

export function stripGemmaToolCalls(text: string): string | undefined {
  const stripped = text.replace(/<\|tool_call>[\s\S]*?<tool_call\|>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length ? stripped : undefined;
}

function parseCall(body: string): { name: string; arguments: unknown; consumed: number } | undefined {
  const leading = body.length - body.trimStart().length;
  const source = body.slice(leading);
  const match = /^call:([A-Za-z_][A-Za-z0-9_]*)/.exec(source);
  if (!match) return undefined;
  const index = skipWs(source, match[0].length);
  if (source[index] !== '{') return undefined;
  const parsed = parseObject(source, index);
  if (!parsed) return undefined;
  return { name: match[1], arguments: parsed.value, consumed: leading + parsed.next };
}

function skipWs(input: string, index: number): number {
  let next = index;
  while (next < input.length && /\s/.test(input[next] ?? '')) next += 1;
  return next;
}

function parseValue(input: string, index: number): { value: unknown; next: number } | undefined {
  const start = skipWs(input, index);
  if (input.startsWith(STRING_MARK, start)) {
    const from = start + STRING_MARK.length;
    const end = input.indexOf(STRING_MARK, from);
    if (end < 0) return undefined;
    return { value: input.slice(from, end), next: end + STRING_MARK.length };
  }
  const mark = input[start];
  if (mark === '{') return parseObject(input, start);
  if (mark === '[') return parseArray(input, start);
  const literal = /^(true|false|null|-?\d+(?:\.\d+)?)(?=[,}\]\s]|$)/.exec(input.slice(start));
  if (!literal) return undefined;
  const raw = literal[1];
  let value: unknown = Number(raw);
  if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (raw === 'null') value = null;
  return { value, next: start + raw.length };
}

function parseObject(input: string, index: number): { value: Record<string, unknown>; next: number } | undefined {
  if (input[index] !== '{') return undefined;
  let cursor = skipWs(input, index + 1);
  const value: Record<string, unknown> = {};
  if (input[cursor] === '}') return { value, next: cursor + 1 };
  while (cursor < input.length) {
    cursor = skipWs(input, cursor);
    const key = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(cursor));
    if (!key) return undefined;
    cursor = skipWs(input, cursor + key[0].length);
    if (input[cursor] !== ':') return undefined;
    const parsed = parseValue(input, cursor + 1);
    if (!parsed) return undefined;
    value[key[0]] = parsed.value;
    cursor = skipWs(input, parsed.next);
    if (input[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (input[cursor] === '}') return { value, next: cursor + 1 };
    return undefined;
  }
  return undefined;
}

function parseArray(input: string, index: number): { value: unknown[]; next: number } | undefined {
  if (input[index] !== '[') return undefined;
  let cursor = skipWs(input, index + 1);
  const value: unknown[] = [];
  if (input[cursor] === ']') return { value, next: cursor + 1 };
  while (cursor < input.length) {
    const parsed = parseValue(input, cursor);
    if (!parsed) return undefined;
    value.push(parsed.value);
    cursor = skipWs(input, parsed.next);
    if (input[cursor] === ',') {
      cursor += 1;
      continue;
    }
    if (input[cursor] === ']') return { value, next: cursor + 1 };
    return undefined;
  }
  return undefined;
}
