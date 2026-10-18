import type { DiffFile, Thread } from './api';

type Line = DiffFile['lines'][number];

// Whether a thread sits on this diff line: its number on the side the thread was opened on.
const sits = (t: Thread, l: Line) => t.line != null && (t.side === 'old' ? l.t !== 'add' && l.old === t.line : l.t !== 'del' && l.new === t.line);

// The threads of one file split by where they show: under the line they are about, or, when the
// diff no longer has that line (or the thread is on the whole file), in `loose`.
export function threadsForFile(file: DiffFile, threads: Thread[]): { byLine: Map<number, Thread[]>; loose: Thread[] } {
  const byLine = new Map<number, Thread[]>();
  const loose: Thread[] = [];
  for (const t of threads) {
    if (t.path !== file.path && t.path !== file.oldPath) continue;
    const at = file.lines.findIndex((l) => l.t !== 'hunk' && sits(t, l));
    if (at < 0) loose.push(t);
    else byLine.set(at, [...(byLine.get(at) ?? []), t]);
  }
  return { byLine, loose };
}
