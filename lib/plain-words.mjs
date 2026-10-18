// A cheap check that the tour speaks plain words. A chapter title or a first sentence that
// names code (a function, a file, a variable) is written for the author, not for the reader
// who has not seen the code. It only finds the obvious cases; it never rewrites anything,
// it tells the reader, and the skill is what asks for plain words. Pure.

// Brand and product names that look like code (camelCase) but are plain words.
const PLAIN = /^(iOS|iPhone|iPad|macOS|GitLab|GitHub|PayPal|JavaScript|TypeScript|OAuth|GraphQL|PostgreSQL|MySQL|MongoDB|LinkedIn|YouTube|WhatsApp|eBay|PhD)$/;
const CODE_LIKE = [
  /[a-z][A-Z]/, // camelCase
  /\w_\w/, // snake_case
  /\w\.[a-z]\w+/i, // member access or file name: resource.type, helper.ts
  /\(\)/, // a call
  /\//, // a path
  /`/, // a code span
];

// The first code-looking word of the text, or null.
export function technicalWord(text) {
  for (const token of String(text ?? '').split(/\s+/)) {
    const word = token.replace(/^[("'[]+|["'\].,;:!?]+$/g, '');
    if (word && !PLAIN.test(word) && CODE_LIKE.some((re) => re.test(word)) && !/^(e\.g|i\.e)$/i.test(word)) return word;
  }
  return null;
}

export const firstSentence = (text) => String(text ?? '').split(/(?<=[.!?])\s/)[0];
