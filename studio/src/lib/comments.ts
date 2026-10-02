// Each "Comment to post" blockquote gets a number, counted over the whole
// review, so "#3" stays #3 whatever sections are collapsed.

// Top-level blockquotes in a markdown text: a quote starts on a ">" line and
// lasts until a blank line (lazy continuation lines stay in it), outside fences.
export function countQuotes(md: string): number {
  let count = 0;
  let inQuote = false;
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^\s{0,3}>/.test(line)) {
      if (!inQuote) count += 1;
      inQuote = true;
    } else if (!line.trim()) inQuote = false;
  }
  return count;
}

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

// Rehype plugin: numbers the top-level blockquotes of one rendered chunk,
// starting after `start` (the quotes of the chunks before it).
export const numberQuotes = (start: number) => () => (tree: HastNode) => {
  let n = start;
  const walk = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'blockquote') {
      n += 1;
      node.properties = { ...node.properties, dataCommentNumber: n };
      return;
    }
    node.children?.forEach(walk);
  };
  walk(tree);
};

export interface CommentRef {
  id: string;
  number: number | null;
  text: string;
}

// What the bot receives when a question is about one comment.
export function questionAbout(about: CommentRef, question: string): string {
  const label = about.number ? `comment #${about.number}` : 'this comment';
  const quoted = about.text.split('\n').map((l) => `> ${l}`).join('\n');
  return `About ${label} of your review:\n${quoted}\n\n${question}`;
}
