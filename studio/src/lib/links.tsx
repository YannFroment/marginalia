import { createContext, Fragment, type ReactNode } from 'react';

export interface LinkContextValue {
  projectUrl: string | null;
  branch: string | null;
  // The review's own MR (https://host/group/project/-/merge_requests/N), when tracked.
  mrWebUrl: string | null;
}
export const LinkContext = createContext<LinkContextValue>({ projectUrl: null, branch: null, mrWebUrl: null });

// `!3909` (MR) or a file path with an optional `:line` / `:start-end`.
// A bare name (no slash) must have a well-known extension, so "Next.js" or
// "e.g." don't match.
const EXT = 'tsx?|jsx?|mjs|cjs|json|ya?ml|md|css|scss|sh|toml|lock|html|graphql|sql';
const PATH = `(?:[\\w@.~-]+/)+[\\w@.~-]+\\.(?:${EXT})|\\b[\\w@-]+(?:\\.[\\w@-]+)*\\.(?:tsx?|mjs|cjs|json|ya?ml|md|lock|toml|sh)\\b`;
const TOKEN = new RegExp(`(?<![\\w/])(?:(!\\d+)|((?:${PATH})(?::(\\d+)(?:-(\\d+))?)?))`, 'g');
const FULL_PATH = new RegExp(`^(?:${PATH})(?::(\\d+)(?:-(\\d+))?)?$`);

// GitLab's anchor for a file in the MR "Changes" tab is the SHA-1 of its path.
function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] ?? 0) | (bytes[i] << (24 - (i % 4) * 8));
  words[bytes.length >> 2] = (words[bytes.length >> 2] ?? 0) | (0x80 << (24 - (bytes.length % 4) * 8));
  const total = (((bytes.length + 8) >> 6) + 1) * 16;
  for (let i = 0; i < total; i++) words[i] ??= 0;
  words[total - 1] = bytes.length * 8;
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
  const rol = (n: number, b: number) => (n << b) | (n >>> (32 - b));
  for (let i = 0; i < total; i += 16) {
    const w = words.slice(i, i + 16);
    for (let t = 16; t < 80; t++) w[t] = rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let t = 0; t < 80; t++) {
      const [f, k] = t < 20 ? [(b & c) | (~b & d), 0x5a827999] : t < 40 ? [b ^ c ^ d, 0x6ed9eba1] : t < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc | 0] : [b ^ c ^ d, 0xca62c1d6 | 0];
      const tmp = (rol(a, 5) + f + e + k + w[t]) | 0;
      [e, d, c, b, a] = [d, c, rol(b, 30), a, tmp];
    }
    [h0, h1, h2, h3, h4] = [(h0 + a) | 0, (h1 + b) | 0, (h2 + c) | 0, (h3 + d) | 0, (h4 + e) | 0];
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

// A file reference opens in the MR's "Changes" tab (the diff) when the review is
// tied to an MR; otherwise it falls back to the file on the project's branch.
// The `_0_<line>` anchor targets an added line, a context line just opens the file.
function fileUrl(ctx: LinkContextValue, ref: string): string | null {
  const m = ref.match(/^(.*?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  if (ctx.mrWebUrl) {
    return `${ctx.mrWebUrl}/diffs#${sha1Hex(m[1])}${m[2] ? `_0_${m[2]}` : ''}`;
  }
  if (!ctx.projectUrl) return null;
  const path = m[1].split('/').map(encodeURIComponent).join('/');
  const line = m[2] ? `#L${m[2]}${m[3] ? `-${m[3]}` : ''}` : '';
  return `${ctx.projectUrl}/-/blob/${encodeURIComponent(ctx.branch ?? 'develop').replace(/%2F/g, '/')}/${path}${line}`;
}

// The file a review comment is about: the first `path[:line]` of the bullet just
// above it (`above` is the review text before the comment). Earlier comment
// blockquotes are ignored. Only repo-relative paths (with a slash) count; the
// line is optional and, when absent, the comment attaches to the whole file.
export function commentLocation(above: string): { path: string; line?: number } | null {
  const bullet = above.slice(Math.max(above.lastIndexOf('\n- '), 0)).split('\n').filter((l) => !l.startsWith('>')).join('\n');
  for (const m of bullet.matchAll(TOKEN)) {
    if (m[2]?.includes('/')) return { path: m[2].replace(/:\d+(?:-\d+)?$/, ''), ...(m[3] ? { line: Number(m[3]) } : {}) };
  }
  return null;
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
