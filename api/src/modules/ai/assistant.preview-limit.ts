import { apiError } from '../../http-error';

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;

/** In-memory window. Preview does not insert an assistant_events row, so it stays off the message quota. */
export function consumeAssistantPreview(organisationId: string, limit: number, now = Date.now()): void {
  const cap = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 60;
  const recent = (hits.get(organisationId) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= cap) {
    hits.set(organisationId, recent);
    throw apiError(429, 'ASSISTANT_PREVIEW_LIMIT', 'Too many invoice previews. Wait a minute and try again.');
  }
  recent.push(now);
  hits.set(organisationId, recent);
}
