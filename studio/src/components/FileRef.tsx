import { parseFileRef } from '../lib/links';

// A file reference as a chip: the directory fades, the file name carries the weight,
// the extension takes the accent and the line is a badge of its own.
export function FileRef({ text, href }: { text: string; href: string | null }) {
  const ref = parseFileRef(text);
  if (!ref) return null;
  const cls = 'not-prose inline-flex max-w-full items-baseline gap-px rounded-md border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 align-baseline font-mono text-[0.85em] leading-snug text-zinc-800 no-underline dark:border-zinc-700/70 dark:bg-zinc-800/70 dark:text-zinc-100';
  // A long path never wraps inside the chip: the directory gives way (its start fades into an
  // ellipsis, so the folders nearest the file stay), the file name and the line never split.
  const body = (
    <>
      {ref.dir && <span className="min-w-0 truncate text-fg-subtle [direction:rtl]"><bdi dir="ltr">{ref.dir}</bdi></span>}
      <span className="shrink-0 whitespace-nowrap font-medium">{ref.name}<span className="font-normal text-violet-600 dark:text-violet-400">{ref.ext}</span></span>
      {ref.line && <span className="ml-1 shrink-0 self-center whitespace-nowrap rounded bg-blue-500/15 px-1 text-[0.8em] text-blue-700 dark:text-blue-300">:{ref.line}</span>}
    </>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" title={text} className={`${cls} hover:border-blue-500/50`}>{body}</a> : <span title={text} className={cls}>{body}</span>;
}
