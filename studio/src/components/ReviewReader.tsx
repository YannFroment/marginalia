import { Children, createElement, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import * as Collapsible from '@radix-ui/react-collapsible';
import { SemanticText } from 'semfont';
import { toast } from 'sonner';
import { useScrollLock } from '../lib/useScrollLock';
import { usePersistentState } from '../lib/layout';
import { useModalFocus } from '../lib/useModalFocus';
import { createContext } from 'react';
import { Check, ChevronRight, Clock, Copy, ExternalLink, Loader2, Microscope, PanelRight, Pencil, Send, Sparkles, Undo2 } from 'lucide-react';
import { postComment, requestAction, type ActionKind, type BotStatus, type PostedInfo, type ReviewItem } from '../lib/api';
import type { BotState } from './TabIcon';
import { cn, timeAgo } from '../lib/utils';
import { VerdictBadge } from './VerdictBadge';
import { LinkContext, commentLocation, linkify, linkifyCode, type LinkContextValue } from '../lib/links';

interface Section {
  id: string;
  title: string;
  body: string;
}

const OPEN_BY_DEFAULT = /critical|important|verdict|summary|blocking|bloquant|statut|status/i;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

// Splits on "## " / "### " headings, ignoring fenced code blocks.
function splitSections(md: string): { intro: string; sections: Section[] } {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let intro: string[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  const flush = () => {
    if (!cur) return;
    sections.push({ id: `${slugify(cur.title)}-${sections.length}`, title: cur.title, body: cur.lines.join('\n') });
  };
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && line.match(/^#{2,3}\s+(.+)$/);
    if (h) {
      flush();
      cur = { title: h[1].replace(/[*`]/g, ''), lines: [] };
    } else if (cur) cur.lines.push(line);
    else intro.push(line);
  }
  flush();
  return { intro: intro.join('\n'), sections };
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          toast.success('Comment copied to clipboard');
        } catch {
          toast.error('Could not copy: clipboard access was denied');
        }
      }}
      className="touch-target inline-flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </button>
  );
}

// Edits survive collapsing a section or reloading; keyed by the original text.
const editKey = (original: string) => {
  let h = 0;
  for (let i = 0; i < original.length; i += 1) h = (h * 31 + original.charCodeAt(i)) | 0;
  return `mr-review-viewer:edit:${h}`;
};
const readEdit = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeEdit = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

interface PostContextValue {
  allowPosting: boolean;
  postDryRun: boolean;
  slug: string | null;
  iid: string | number | null;
  posted: Record<string, PostedInfo>;
  reload: () => void;
}
const PostContext = createContext<PostContextValue>({ allowPosting: false, postDryRun: false, slug: null, iid: null, posted: {}, reload: () => {} });
// The markdown a blockquote's `position.start.offset` refers to (one section body, not the whole review).
const SourceContext = createContext('');

// The "**Comment to post:**" line before a blockquote: the card already carries that label.
const COMMENT_LABEL = /^comment to post\s*:?$/i;

// Nothing is sent until "Post comment" is clicked here, with the final text.
function ConfirmPost({ iid, text, target, dryRun, onCancel, onConfirm, fallbackRef }: { iid: string | number; text: string; target: { path: string; line?: number } | null; dryRun: boolean; onCancel: () => void; onConfirm: () => Promise<void>; fallbackRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  // Focus moves to Cancel (the safe choice), stays inside, and returns to the opener on close.
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]', fallback: fallbackRef });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-post-title" aria-describedby="confirm-post-text" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-post-title" className="text-base font-semibold">Post this comment on !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">{dryRun ? 'Dry run: nothing will be sent to GitLab.' : 'It will be posted on GitLab under your account and visible to the MR author.'}</p>
        <p className="mt-1 text-sm text-fg-muted">
          {target ? <>Anchored on <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] dark:bg-zinc-800">{target.path}{target.line ? `:${target.line}` : ''}</code> in the diff{target.line ? '' : ' (whole file)'}.</> : 'No file found above it: it will be a general comment.'}
        </p>
        <pre id="confirm-post-text" tabIndex={0} aria-label="Comment text" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">{text}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <button data-autofocus disabled={busy} onClick={onCancel} className="touch-target rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Cancel</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } catch (e) {
                toast.error('Could not post the comment', { description: (e as Error).message });
                setBusy(false);
              }
            }}
            className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}Post comment
          </button>
        </div>
      </div>
    </div>
  );
}

// The "**Comment to post:**" blockquotes are meant to be pasted into GitLab:
// copy as is, or edit first in a textarea (the edit is kept locally).
function Quote({ children, offset }: { children?: ReactNode; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState(() => textOf(children).trim());
  const key = editKey(original);
  const [edited, setEdited] = useState<string | null>(() => readEdit(key));
  const [editing, setEditing] = useState(false);
  const current = edited ?? ref.current?.innerText.trim() ?? original;
  const post = useContext(PostContext);
  const source = useContext(SourceContext);
  const commentId = key.split(':').pop() ?? '';
  const postedInfo = post.slug ? post.posted[`${post.slug}:${commentId}`] : undefined;
  const [confirming, setConfirming] = useState(false);
  // The file:line the review mentions just above this comment, since the last heading.
  const target = useMemo(() => {
    if (offset === undefined) return null;
    const above = source.slice(0, offset);
    return commentLocation(above.slice(Math.max(above.lastIndexOf('\n#'), 0)));
  }, [source, offset]);
  // Focus lands here if the button that opened the dialog is gone (a posted comment replaces it).
  const rootRef = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    const text = ref.current?.innerText.trim() ?? original;
    setOriginal((o) => o || text);
    setEdited((e) => e ?? text);
    setEditing(true);
  };
  const update = (v: string) => {
    setEdited(v);
    writeEdit(key, v);
  };
  const reset = () => {
    setEdited(null);
    writeEdit(key, null);
    setEditing(false);
    toast('Reverted to the generated comment');
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="not-prose my-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 focus:outline-none">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">
        <span>
          Comment to post{edited !== null && !editing ? ' · edited' : ''}
          {postedInfo && (
            <a href={postedInfo.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 normal-case tracking-normal text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300">
              <Check className="size-3" />Posted {timeAgo(postedInfo.at)}<ExternalLink className="size-3" />
            </a>
          )}
        </span>
        <span className="flex items-center gap-1.5 normal-case tracking-normal">
          {edited !== null && (
            <button onClick={reset} className="touch-target inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              <Undo2 className="size-3.5" />Reset
            </button>
          )}
          <button
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="touch-target inline-flex items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? 'Done' : 'Edit'}
          </button>
          <CopyButton label="Copy" getText={() => current} />
          {post.allowPosting && post.slug && post.iid && !postedInfo && (
            <button
              onClick={() => setConfirming(true)}
              className="touch-target inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              <Send className="size-3.5" />Post to GitLab
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={edited ?? ''}
          onChange={(e) => update(e.target.value)}
          rows={Math.min(14, Math.max(4, (edited ?? '').split('\n').length + 2))}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm leading-relaxed outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      ) : edited !== null ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{edited}</div>
      ) : (
        <div ref={ref} className="whitespace-pre-wrap text-sm leading-relaxed">{Children.toArray(children)}</div>
      )}
      {confirming && post.slug && post.iid && (
        <ConfirmPost
          iid={post.iid}
          text={current}
          target={target}
          dryRun={post.postDryRun}
          fallbackRef={rootRef}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const posted = await postComment(post.slug!, commentId, current, target ?? undefined);
            setConfirming(false);
            if ('simulated' in posted) {
              toast.info(`Dry run: would post on ${posted.path ? `${posted.path}${posted.line ? `:${posted.line}` : ''}` : 'the MR'} of !${posted.iid}`);
              return;
            }
            post.reload();
            if (target && posted.inline === false) toast.warning('Could not anchor it to the diff, posted as a general comment');
            toast.success(posted.inline ? `Comment posted on ${target?.path}${target?.line ? `:${target.line}` : ''}` : `Comment posted on !${post.iid}`, { action: { label: 'Open', onClick: () => window.open(posted.url, '_blank', 'noopener') } });
          }}
        />
      )}
    </div>
  );
}

// A handful of languages instead of highlight.js's whole "common" set: reviews quote
// TypeScript, config and shell, and rarely anything else (unknown fences stay plain).
const HIGHLIGHT = {
  detect: false,
  languages: { bash, css, diff, javascript, json, typescript, xml, yaml },
  aliases: { bash: ['sh', 'shell', 'zsh'], javascript: ['js', 'jsx', 'mjs'], typescript: ['ts', 'tsx'], xml: ['html', 'svg'], yaml: ['yml'] },
};

// Vocabulary of code reviews, merged over semfont's defaults.
const LEXICON = {
  valence: { blocker: -0.8, blocks: -0.6, regression: -0.7, leak: -0.6, unsafe: -0.7, vulnerability: -0.8, broken: -0.7, missing: -0.4, downgrade: -0.5, fixed: 0.5, resolved: 0.5 },
  salience: { critical: 0.9, important: 0.6, blocker: 0.9, merge: 0.5, must: 0.6, security: 0.7 },
  certainty: { probably: -0.5, likely: -0.4, maybe: -0.5, consider: -0.4 },
};

// Plain-text children become links (MR refs, file paths) and, optionally,
// <SemanticText>; elements (inline code, existing links, nested lists) are
// left alone.
function enrich(children: ReactNode, semantic: boolean, ctx: LinkContextValue): ReactNode {
  return Children.map(children, (c) => {
    if (typeof c !== 'string') return c;
    return linkify(c, ctx).map((part, i) =>
      typeof part === 'string' && semantic
        ? <SemanticText key={i} theme="editorial" lexicon={LEXICON}>{part}</SemanticText>
        : part,
    );
  });
}

function makeComponents(semantic: boolean, ctx: LinkContextValue): Components {
  const wrap = (children: ReactNode) => enrich(children, semantic, ctx);
  return {
    p: ({ children }) => (COMMENT_LABEL.test(textOf(children).trim()) ? null : <p>{wrap(children)}</p>),
    li: ({ children }) => <li>{wrap(children)}</li>,
    td: ({ children }) => <td>{wrap(children)}</td>,
    strong: ({ children }) => <strong>{wrap(children)}</strong>,
    em: ({ children }) => <em>{wrap(children)}</em>,
    code: ({ className, children }) => {
      const text = typeof children === 'string' ? children : '';
      const url = !className && text ? linkifyCode(text, ctx) : null;
      const code = createElement('code', { className }, children);
      return url ? <a href={url} target="_blank" rel="noreferrer" className="no-underline hover:underline">{code}</a> : code;
    },
    blockquote: ({ node, children }) => <Quote offset={node?.position?.start.offset}>{children}</Quote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    pre: ({ children }) => <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100 p-3 text-[13px] dark:border-zinc-800 dark:bg-zinc-900">{children}</pre>,
    table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
  };
}

function Md({ children, semantic }: { children: string; semantic: boolean }) {
  const ctx = useContext(LinkContext);
  const components = useMemo(() => makeComponents(semantic, ctx), [semantic, ctx]);
  return (
    <SourceContext.Provider value={children}>
    <div className={cn('prose prose-zinc max-w-none [overflow-wrap:anywhere] prose-headings:tracking-tight prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal dark:prose-invert dark:prose-code:bg-zinc-800 [&_pre_code]:bg-transparent [&_pre_code]:p-0', semantic && 'semfont')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, HIGHLIGHT]]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
    </SourceContext.Provider>
  );
}

type ActionState = 'idle' | 'queued' | 'running';

const ACTION_UI: Record<ActionKind, { Icon: typeof Microscope; label: Record<ActionState, string>; title: string }> = {
  deepen: {
    Icon: Microscope,
    label: { idle: 'Deep review', queued: 'Deep review queued', running: 'Deep review running…' },
    title: [
      'Deep review, on top of the automatic review:',
      '• re-checks each finding and the MR description against the full source files',
      '• installs the dependencies, runs the type check and the tests related to the changed files',
      '• reads all the MR discussions, so nothing a reviewer said is repeated',
      'The deep review replaces the automatic one when done. Slower and more expensive.',
    ].join('\n'),
  },
};

function ActionButton({ slug, action, state }: { slug: string; action: ActionKind; state: ActionState }) {
  const { Icon, label, title } = ACTION_UI[action];
  return (
    <button
      disabled={state !== 'idle'}
      onClick={async () => {
        try {
          const r = await requestAction(slug, action);
          toast.info(r.state === 'started' ? `${label.running.replace('…', '')} on !${r.iid}` : `${label.queued} on !${r.iid}: it starts after the running review`);
        } catch (e) {
          toast.error(`Could not start: ${label.idle}`, { description: (e as Error).message });
        }
      }}
      title={title}
      className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      {state === 'running' ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" aria-hidden /> : state === 'queued' ? <Clock className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {label[state]}
    </button>
  );
}

const formatRunAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// What the run is doing right now, for the MR on screen.
function LiveRun({ live }: { live: NonNullable<BotStatus['current']> }) {
  const steps = live.progress ?? [];
  return (
    <section aria-live="polite">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
        <Loader2 className="size-3 animate-spin motion-reduce:animate-pulse" aria-hidden />Running now
      </h2>
      {steps.length ? (
        <ol className="space-y-1 text-xs text-fg-muted">
          {steps.map((s, i) => (
            <li key={`${i}-${s}`} className={cn('break-words', i === steps.length - 1 && 'font-medium text-zinc-900 dark:text-zinc-100')}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-fg-muted">Starting…</p>
      )}
    </section>
  );
}

export function ReviewReader({ item, markdown, projectUrl, allowPosting, postDryRun, deepenEnabled, botState, live, posted, reload }: { item: ReviewItem | undefined; markdown: string | null; projectUrl: string | null; allowPosting: boolean; postDryRun: boolean; deepenEnabled: boolean; botState: BotState; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const postCtx = useMemo(() => ({ allowPosting, postDryRun, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload }), [allowPosting, postDryRun, item?.slug, item?.tracked, item?.iid, posted, reload]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const { intro, sections } = useMemo(() => splitSections(markdown ?? ''), [markdown]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (s: Section) => overrides[s.id] ?? OPEN_BY_DEFAULT.test(s.title);
  const [semantic, setSemantic] = usePersistentState('mr-review-viewer:semantic-on', true);
  const [panelOpen, setPanelOpen] = usePersistentState('mr-review-viewer:panel-open', true);
  const allOpen = sections.every(isOpen);
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(sections.map((s) => [s.id, open])));
  const jump = (id: string) => {
    setOverrides((o) => ({ ...o, [id]: true }));
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
  };

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <div className="px-6 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-sm text-fg-muted">
            {item?.iid && <span className="font-mono">!{item.iid}</span>}
            {item?.author && <span>· {item.author}</span>}
            {item && <span>· {timeAgo(item.reviewedAt)}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{item?.title ?? 'Review'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={item?.verdict ?? null} />
            {item?.branch && <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{item.branch}</code>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSemantic((v) => !v)}
            aria-pressed={semantic}
            title="Typography that follows meaning (semfont): colour for sentiment, weight for importance, slant for hedges"
            className={cn('touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', semantic ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400')}
          >
            <Sparkles className="size-3.5" />Semantic type
          </button>
          {deepenEnabled && item?.tracked && <ActionButton slug={item.slug} action="deepen" state={botState === 'deepening' ? 'running' : botState === 'deepen-queued' ? 'queued' : 'idle'} />}
          {item?.webUrl && (
            <a href={item.webUrl} target="_blank" rel="noreferrer" className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
              Open in GitLab<ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-pressed={panelOpen}
            aria-label="Toggle side panel"
            title="Toggle side panel"
            className={cn('hidden rounded-lg border p-1.5 lg:block', panelOpen ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800' : 'border-zinc-200 bg-white text-fg-muted dark:border-zinc-800 dark:bg-zinc-900')}
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </div>

      {markdown === null ? (
        <p className="text-fg-muted">Loading…</p>
      ) : (
        <div className="flex gap-8">
          <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            {intro.trim() && <Md semantic={semantic}>{intro}</Md>}
            {sections.map((s) => (
              <Collapsible.Root
                key={s.id}
                id={s.id}
                open={isOpen(s)}
                onOpenChange={(o) => setOverrides((prev) => ({ ...prev, [s.id]: o }))}
                className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* A real heading around the trigger, so screen-reader users can jump between sections. */}
                <h2 className="text-base">
                  <Collapsible.Trigger className="group flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left font-medium">
                    <ChevronRight className={cn('size-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none', isOpen(s) && 'rotate-90')} aria-hidden />
                    {s.title}
                  </Collapsible.Trigger>
                </h2>
                <Collapsible.Content className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
                  <Md semantic={semantic}>{s.body}</Md>
                </Collapsible.Content>
              </Collapsible.Root>
            ))}
          </article>

          {/* Side panel: context that stays visible while reading. Collapses to give the article the room. */}
          <aside
            aria-label="Review details"
            aria-hidden={!panelOpen}
            className={cn('sticky top-[calc(var(--chrome-h)+1rem)] hidden h-[calc(100vh-var(--chrome-h)-2rem)] shrink-0 self-start overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none lg:block', panelOpen ? 'w-64 opacity-100' : 'w-0 opacity-0')}
          >
            <div className="flex h-full w-64 flex-col gap-5 overflow-y-auto pr-1 text-sm">
              {live ? <LiveRun live={live} /> : item?.lastDeepAt && (
                <section className="space-y-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <p className="flex items-center gap-2"><Microscope className="size-4 shrink-0" aria-hidden />Deep review on {formatRunAt(item.lastDeepAt)}</p>
                </section>
              )}
              <section>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Details</h2>
                <dl className="space-y-1.5">
                  {item?.iid && <Row label="Merge request">{item.webUrl ? <a className="text-blue-600 hover:underline dark:text-blue-400" href={item.webUrl} target="_blank" rel="noreferrer">!{item.iid}</a> : `!${item.iid}`}</Row>}
                  {item?.author && <Row label="Author">{item.author}</Row>}
                  {item?.branch && <Row label="Branch"><span className="break-all font-mono text-xs">{item.branch}</span></Row>}
                  {item && <Row label="Reviewed">{timeAgo(item.reviewedAt)}</Row>}
                  {item && <Row label="Findings">{item.critical} critical · {item.important} important</Row>}
                </dl>
              </section>
              <section className="min-h-0">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-fg-muted">
                  <h2 className="font-medium">Contents</h2>
                  <button className="normal-case hover:text-zinc-900 dark:hover:text-zinc-100" tabIndex={panelOpen ? 0 : -1} onClick={() => setAll(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
                </div>
                <ul className="space-y-0.5">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#/${item?.slug}`}
                        tabIndex={panelOpen ? 0 : -1}
                        onClick={(e) => {
                          e.preventDefault();
                          jump(s.id);
                        }}
                        className="block truncate rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
