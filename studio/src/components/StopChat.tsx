import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic } from 'lucide-react';
import { askAboutStop, type ChatMessage } from '../lib/chatApi';
import { useSpeechInput, withDictation } from '../lib/useSpeechInput';
import { cn } from '../lib/utils';
import { NoteMarkdown } from './NoteMarkdown';

// Ask Claude about the stop on screen. Each stop keeps its own conversation, so going
// back to a stop finds it as it was; the answer is read-only and never posted.
export function StopChat({ slug, stopId }: { slug: string; stopId: string }) {
  const [byStop, setByStop] = useState<Record<string, ChatMessage[]>>({});
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // What was typed before the dictation started: the dictated words are added after it.
  const typed = useRef('');
  const speech = useSpeechInput((dictated) => setText(withDictation(typed.current, dictated)));
  const sent = useRef(false);
  const messages = byStop[stopId] ?? [];

  // Follow the conversation after a question is sent, never on load or when switching stops:
  // scrolling then would drag the whole page down to the chat.
  useEffect(() => {
    if (!sent.current) return;
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length, pending]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history = messages;
    speech.stop();
    sent.current = true;
    setText('');
    setError(null);
    setPending(stopId);
    setByStop((prev) => ({ ...prev, [stopId]: [...history, { role: 'user', text: q }] }));
    try {
      const answer = await askAboutStop(slug, stopId, q, history);
      setByStop((prev) => ({ ...prev, [stopId]: [...(prev[stopId] ?? []), { role: 'assistant', text: answer }] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    // A fragment: the form must be a direct child of the scrolling section to stay pinned.
    <>
      <div aria-live="polite" className="mt-4 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {messages.map((m, i) => (
          m.role === 'user'
            ? <p key={i} className="ml-auto w-fit max-w-[90%] rounded-lg bg-zinc-100 px-3 py-1.5 text-sm dark:bg-zinc-800">{m.text}</p>
            : <NoteMarkdown key={i} className="text-sm">{m.text}</NoteMarkdown>
        ))}
        {pending === stopId && <p className="flex items-center gap-1.5 text-xs text-fg-muted"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" aria-hidden />Reading the code…</p>}
        {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">Could not answer: {error}</p>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="sticky bottom-0 -mx-4 bg-white px-4 pb-4 pt-2 dark:bg-zinc-900"
      >
        <div className={cn(
          'flex items-end gap-1 rounded-xl border bg-zinc-50 py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/40 dark:bg-zinc-950 dark:focus-within:bg-zinc-950',
          speech.listening ? 'border-red-500/70' : 'border-zinc-200 dark:border-zinc-800',
        )}>
          <textarea
            value={text}
            onChange={(e) => {
              speech.stop();
              setText(e.target.value);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
            rows={1}
            maxLength={2000}
            placeholder={speech.listening ? 'Listening…' : 'Ask about this stop'}
            aria-label="Ask about this stop"
            className="max-h-32 min-h-7 flex-1 resize-none self-center bg-transparent py-1 text-sm leading-5 outline-none [field-sizing:content] placeholder:text-fg-subtle"
          />
          {speech.supported && (
            <button
              type="button"
              aria-label={speech.listening ? 'Stop dictation' : 'Dictate your question'}
              aria-pressed={speech.listening}
              title={speech.listening ? 'Stop dictation' : 'Dictate (the browser sends the audio to its speech service)'}
              disabled={pending !== null}
              onClick={() => {
                if (speech.listening) speech.stop();
                else {
                  typed.current = text;
                  speech.start();
                }
              }}
              className={cn('grid size-7 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-40', speech.listening ? 'bg-red-600 text-white motion-safe:animate-pulse' : 'text-fg-muted hover:bg-zinc-200/70 dark:hover:bg-zinc-800')}
            >
              <Mic className="size-4" />
            </button>
          )}
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim() || pending !== null}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white transition-opacity hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
      {speech.error && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{speech.error}</p>}
    </>
  );
}
