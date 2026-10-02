import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Send, ShieldQuestion } from 'lucide-react';
import { answerChatPermission, chatEvents, sendChat, type ChatAsk } from '../lib/api';
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
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
  const logRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [asks, setAsks] = useState<ChatAsk[]>([]);

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
  // Like a terminal: the history scrolls inside its own box, newest at the bottom.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, steps, open, asks]);

  // Answers stream in from the open discussion, whoever sent the message.
  useEffect(
    () =>
      chatEvents(slug, (event) => {
        setPending(event.pending);
        if (event.type === 'hello') setAsks(event.asks ?? []);
        if (event.type === 'permission' && event.ask) setAsks((a) => [...a, event.ask!]);
        if (event.type === 'permission_answered' || event.type === 'closed') setAsks((a) => (event.id ? a.filter((x) => x.id !== event.id) : []));
        if (event.type === 'step' && event.text) setSteps((s) => [...s, event.text!].slice(-4));
        if (event.type === 'answer' || event.type === 'error') {
          setSteps([]);
          setMessages((m) => [...m, { role: 'bot', text: event.text ?? '', error: event.type === 'error' }]);
        }
      }),
    [slug],
  );

  // Like a terminal: a message can be sent at any time; it is answered in turn.
  const ask = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setMessages((m) => [...m, { role: 'you', text }]);
    try {
      await sendChat(slug, text);
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: (e as Error).message, error: true }]);
    }
  };

  const decide = async (ask: ChatAsk, allow: boolean) => {
    setAsks((a) => a.filter((x) => x.id !== ask.id));
    try {
      await answerChatPermission(slug, ask.id, allow);
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', text: (e as Error).message, error: true }]);
    }
  };

  return (
    <section aria-label="Ask the bot" className="not-prose mt-6 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mb-2 flex w-full items-center gap-2 text-left text-sm font-semibold">
        <MessageSquare className="size-4" aria-hidden />Ask the bot about this review
        {messages.length > 0 && <span className="text-xs font-normal text-fg-muted">({messages.length})</span>}
        {open ? <ChevronDown className="ml-auto size-4" aria-hidden /> : <ChevronUp className="ml-auto size-4" aria-hidden />}
      </button>
      {open && (
        <div ref={logRef} className={cn('mb-2 space-y-3 overflow-y-auto pr-1', messages.length || busy || asks.length ? 'h-[40vh]' : 'hidden')} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={cn('whitespace-pre-wrap rounded-lg px-3 py-2 text-sm', m.role === 'you' ? 'ml-8 bg-blue-500/10' : 'mr-8 bg-zinc-500/10', m.error && 'text-red-600 dark:text-red-400')}>
              <span className="mb-0.5 block text-xs font-medium text-fg-muted">{m.role === 'you' ? 'You' : 'Bot'}</span>
              {m.text}
            </div>
          ))}
          {asks.map((ask) => (
            <div key={ask.id} role="group" aria-label={`The bot asks to use ${ask.tool}`} className="mr-8 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium"><ShieldQuestion className="size-4" aria-hidden />The bot asks to use {ask.tool}</p>
              {ask.description && <p className="mb-1">{ask.description}</p>}
              {typeof ask.input.command === 'string' && <pre className="mb-1 overflow-x-auto rounded bg-zinc-500/10 p-2 text-xs">{ask.input.command}</pre>}
              {typeof ask.input.file_path === 'string' && <p className="mb-1 font-mono text-xs">{ask.input.file_path}</p>}
              {ask.reason && <p className="mb-2 text-xs text-fg-muted">{ask.reason}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => decide(ask, true)} className="touch-target rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">Allow</button>
                <button type="button" onClick={() => decide(ask, false)} className="touch-target rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-500/10 dark:border-zinc-700">Deny</button>
              </div>
            </div>
          ))}
          {busy && (
            <div className="space-y-1 text-xs text-fg-muted">
              <p className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin motion-reduce:animate-pulse" aria-hidden />The bot is answering…{pending > 1 && ` (${pending - 1} more waiting)`}</p>
              {steps.map((s, i) => <p key={i} className="truncate pl-4">{s}</p>)}
            </div>
          )}
        </div>
      )}
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
        <button type="submit" disabled={!draft.trim()} className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
          <Send className="size-3.5" aria-hidden />Send
        </button>
      </form>
    </section>
  );
}
