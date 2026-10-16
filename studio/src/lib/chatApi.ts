export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

// One question about a tour stop. Slow (a headless Claude run), so callers show a pending state.
export async function askAboutStop(slug: string, stopId: string, question: string, history: ChatMessage[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, stopId, question, history }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.answer as string;
}
