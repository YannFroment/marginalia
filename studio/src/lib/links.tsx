import { createContext, Fragment, type ReactNode } from 'react';

export interface LinkContextValue {
  projectUrl: string | null;
  branch: string | null;
}
export const LinkContext = createContext<LinkContextValue>({ projectUrl: null, branch: null });

// `!3909` (MR) or a file path with an optional `:line` / `:start-end`.
// A bare name (no slash) must have a well-known extension, so "Next.js" or
// "e.g." don't match.
const EXT = 'tsx?|jsx?|mjs|cjs|json|ya?ml|md|css|scss|sh|toml|lock|html|graphql|sql';
const PATH = `(?:[\\w@.~-]+/)+[\\w@.~-]+\\.(?:${EXT})|\\b[\\w@-]+(?:\\.[\\w@-]+)*\\.(?:tsx?|mjs|cjs|json|ya?ml|md|lock|toml|sh)\\b`;
const TOKEN = new RegExp(`(?<![\\w/])(?:(!\\d+)|((?:${PATH})(?::(\\d+)(?:-(\\d+))?)?))`, 'g');
const FULL_PATH = new RegExp(`^(?:${PATH})(?::(\\d+)(?:-(\\d+))?)?$`);

function fileUrl(ctx: LinkContextValue, ref: string): string | null {
  if (!ctx.projectUrl) return null;
  const m = ref.match(/^(.*?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  const path = m[1].split('/').map(encodeURIComponent).join('/');
  const line = m[2] ? `#L${m[2]}${m[3] ? `-${m[3]}` : ''}` : '';
  return `${ctx.projectUrl}/-/blob/${encodeURIComponent(ctx.branch ?? 'develop').replace(/%2F/g, '/')}/${path}${line}`;
}

const mrUrl = (ctx: LinkContextValue, ref: string) => (ctx.projectUrl ? `${ctx.projectUrl}/-/merge_requests/${ref.slice(1)}` : null);

const LINK_CLS = 'text-blue-600 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-blue-400';

function A({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className={LINK_CLS}>{children}</a>;
}

// Splits plain text into strings and links (MR refs, file paths).
export function linkify(text: string, ctx: LinkContextValue): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const url = m[1] ? mrUrl(ctx, m[1]) : fileUrl(ctx, m[2]);
    if (!url) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<A key={m.index} href={url}>{m[0]}</A>);
    last = m.index + m[0].length;
  }
  if (last === 0) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Inline `code` that is exactly a path (or an MR ref) becomes a link too.
export function linkifyCode(text: string, ctx: LinkContextValue): string | null {
  if (/^!\d+$/.test(text)) return mrUrl(ctx, text);
  return FULL_PATH.test(text) ? fileUrl(ctx, text) : null;
}

export { Fragment };
