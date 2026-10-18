import { commentLocation } from './links';

// Comparable form of a comment: the rendered text drops the markdown the source has.
export const squash = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// The comment as the skill wrote it: the lines of the blockquote that starts at `offset`.
export function writtenComment(source: string, offset: number | undefined): string | null {
  if (offset === undefined) return null;
  const out: string[] = [];
  for (const line of source.slice(offset).split('\n')) {
    if (!/^\s*>/.test(line)) break;
    out.push(line.replace(/^\s*>\s?/, ''));
  }
  return out.join('\n').trim() || null;
}

// The file:line the review mentions just above the comment, since the last heading.
export function commentTargetAt(source: string, offset: number | undefined) {
  if (offset === undefined) return null;
  const above = source.slice(0, offset);
  return commentLocation(above.slice(Math.max(above.lastIndexOf('\n#'), 0)));
}
