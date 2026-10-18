import { Children, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { LinkContext, linkify, type LinkContextValue } from '../lib/links';
import { HIGHLIGHT } from '../lib/highlight';
import { codeComponents, textOf } from '../lib/markdown';
import { cn } from '../lib/utils';
import { SourceContext } from '../lib/reviewContexts';
import { Quote } from './ReviewComment';

// The "**Comment to post:**" line before a blockquote: the card already carries that label.
const COMMENT_LABEL = /^comment to post\s*:?$/i;

// Plain-text children become links (MR refs, file paths); elements (inline code,
// existing links, nested lists) are left alone.
function enrich(children: ReactNode, ctx: LinkContextValue): ReactNode {
  return Children.map(children, (c) => (typeof c === 'string' ? linkify(c, ctx) : c));
}

function makeComponents(ctx: LinkContextValue): Components {
  const wrap = (children: ReactNode) => enrich(children, ctx);
  return {
    p: ({ children }) => (COMMENT_LABEL.test(textOf(children).trim()) ? null : <p>{wrap(children)}</p>),
    li: ({ children }) => <li>{wrap(children)}</li>,
    td: ({ children }) => <td>{wrap(children)}</td>,
    strong: ({ children }) => <strong>{wrap(children)}</strong>,
    em: ({ children }) => <em>{wrap(children)}</em>,
    ...codeComponents(ctx),
    blockquote: ({ node, children }) => <Quote offset={node?.position?.start.offset}>{children}</Quote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
  };
}

export function Md({ children }: { children: string }) {
  const ctx = useContext(LinkContext);
  const components = useMemo(() => makeComponents(ctx), [ctx]);
  return (
    <SourceContext.Provider value={children}>
    <div className={cn('prose prose-zinc max-w-none [overflow-wrap:anywhere] prose-headings:tracking-tight prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal dark:prose-invert dark:prose-code:bg-zinc-800 [&_pre_code]:bg-transparent [&_pre_code]:p-0')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, HIGHLIGHT]]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
    </SourceContext.Provider>
  );
}

const GLANCE_LINE = /^[-*]\s+\*\*(What|Why|Risk|Blocking):\*\*\s*(.+)$/i;
const NOTHING_BLOCKING = /^(nothing|none|rien|aucun)\b/i;

// "At a Glance": four one-line answers (What / Why / Risk / Blocking) as a definition list.
// Falls back to plain markdown if the agent wrote something else.
export function GlanceBody({ body }: { body: string }) {
  const rows = body.split('\n').flatMap((line) => {
    const m = line.trim().match(GLANCE_LINE);
    return m ? [{ label: m[1], text: m[2] }] : [];
  });
  if (rows.length === 0) return <Md>{body}</Md>;
  return (
    <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5">
      {rows.map((r) => {
        const blocking = /^blocking$/i.test(r.label) && !NOTHING_BLOCKING.test(r.text);
        return (
          <div key={r.label} className="contents">
            <dt className={cn('pt-0.5 text-xs font-medium uppercase tracking-wide text-fg-subtle', blocking && 'text-red-600 dark:text-red-400')}>{r.label}</dt>
            <dd className="min-w-0 [&_.prose_p]:m-0"><Md>{r.text}</Md></dd>
          </div>
        );
      })}
    </dl>
  );
}
