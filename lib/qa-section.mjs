// The QA report lives in the MR's review file, as its last "## QA" section:
// one document per MR. A new QA run replaces the previous section.
const QA_HEADING = /^## QA\b.*$/m;

export function mergeQaSection(review, qa) {
  const section = qa.trim().replace(QA_HEADING, '').trim();
  const at = review.search(QA_HEADING);
  const base = (at === -1 ? review : review.slice(0, at)).trimEnd();
  return `${base}\n\n## QA\n\n${section}\n`;
}
