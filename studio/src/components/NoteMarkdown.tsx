import { useContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { LinkContext } from '../lib/links';
import { HIGHLIGHT } from '../lib/highlight';
import { codeComponents } from '../lib/markdown';
import { cn } from '../lib/utils';

// GitLab hides these (the bot and the review skills leave markers such as
// `<!-- mr-notes:.gitlab-ci.yml:240 -->` in their comments); they are not for a reader.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// A comment written in markdown on GitLab (a thread note, a pending draft): code
// fences, inline code and file references render like they do in the review.
export function NoteMarkdown({ children, className }: { children: string; className?: string }) {
  const ctx = useContext(LinkContext);
  const components = useMemo(() => ({ ...codeComponents(ctx), a: ({ href, children: c }: { href?: string; children?: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{c}</a> }), [ctx]);
  return (
    <div className={cn('prose prose-sm prose-zinc max-w-none [overflow-wrap:anywhere] prose-p:my-1 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal dark:prose-invert dark:prose-code:bg-zinc-800 [&_pre_code]:bg-transparent [&_pre_code]:p-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, HIGHLIGHT]]} components={components}>
        {children.replace(HTML_COMMENT, '').trim()}
      </ReactMarkdown>
    </div>
  );
}
