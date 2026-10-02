import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { sendChat } from '../lib/api';
import { cn } from '../lib/utils';

type Message = { role: 'you' | 'bot'; text: string; error?: boolean };

const historyKey = (slug: string) => `marginalia:chat:${slug}`;
const loadHistory = (slug: string): Message[] => {
  try {
    return JSON.parse(localStorage.getItem(historyKey(slug)) ?? '[]');
  } catch {
    return [];
  }
};

// Ask the bot about this review: each message resumes the Claude session of
// the latest run on the MR, so it answers with everything it read.
export function ReviewChat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<Message[]>(() => loadHistory(slug));
  const [draft, setDraft] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadHistory(slug));
  }, [slug]);
  useEffect(() => {
    try {
      localStorage.setItem(historyKey(slug), JSON.stringify(messages.slice(-40)));
    } catch {
      /* history is a convenience */
    }
  }, [slug, messages]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, steps]);

  const ask = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    setSteps([]);
    setMessages((m) => [...m, { role: 'you', text }]);
    try {
      await sendChat(slug, text, (line) => {
        if (line.type === 'step') setSteps((s) => [...s, line.text].slice(-4));
        else setMessages((m) => [...m, { role: 'bot', text: line.text, error: line.type === 'error' }]);
      });
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
      setSteps([]);
    }
  };

  return (
    <section aria-label="Ask the bot" className="not-prose mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4" aria-hidden />Ask the bot about this review</h2>
      {messages.length > 0 && (
        <ol className="mb-3 space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={cn('whitespace-pre-wrap rounded-lg px-3 py-2 text-sm', m.role === 'you' ? 'ml-8 bg-blue-500/10' : 'mr-8 bg-zinc-500/10', m.error && 'text-red-600 dark:text-red-400')}>
              <span className="mb-0.5 block text-xs font-medium text-fg-muted">{m.role === 'you' ? 'You' : 'Bot'}</span>
              {m.text}
            </li>
          ))}
        </ol>
      )}
      {busy && (
        <div className="mb-3 space-y-1 text-xs text-fg-muted" aria-live="polite">
          <p className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin motion-reduce:animate-pulse" aria-hidden />The bot is answering…</p>
          {steps.map((s, i) => <p key={i} className="truncate pl-4">{s}</p>)}
        </div>
      )}
      <div ref={endRef} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor={`chat-${slug}`} className="sr-only">Your question</label>
        <textarea
          id={`chat-${slug}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          rows={2}
          placeholder="Why is this a blocker? Can you check the B2B flow too?"
          className="min-h-[2.5rem] flex-1 resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
          <Send className="size-3.5" aria-hidden />Send
        </button>
      </form>
    </section>
  );
}
