import { useCallback, useEffect, useRef, useState } from 'react';

// Dictation through the browser's own speech recognition (Chrome, Edge, Safari). Where it is
// missing `supported` is false and the caller hides the microphone.

interface Alternative { transcript: string }
interface RecognitionEvent { results: ArrayLike<ArrayLike<Alternative>> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it for this site in the browser.',
  'service-not-allowed': 'Microphone access is blocked. Allow it for this site in the browser.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection.',
};

// Everything said in one dictation, words not yet final included, as it changes.
export const dictatedText = (results: ArrayLike<ArrayLike<Alternative>>) => Array.from(results, (r) => r[0]?.transcript ?? '').join('').trim();

// Text typed before the dictation, then what was said: one space between, none if either is empty.
export const withDictation = (base: string, dictated: string) => `${base.trimEnd()}${base.trim() && dictated ? ' ' : ''}${dictated}`;

export function useSpeechInput(onDictation: (dictated: string) => void) {
  const supported = recognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<Recognition | null>(null);
  const latest = useRef(onDictation);
  latest.current = onDictation;

  const stop = useCallback(() => active.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || active.current) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => latest.current(dictatedText(e.results));
    rec.onerror = (e) => setError(ERRORS[e.error] ?? null);
    rec.onend = () => {
      active.current = null;
      setListening(false);
    };
    active.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      active.current = null;
    }
  }, []);

  // Leaving the page, or the stop, ends the dictation: the microphone is never left open.
  useEffect(() => () => active.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
