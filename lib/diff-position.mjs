// A "Comment to post" can be anchored on a line of the MR by starting its
// blockquote with `**Line:** \`path/to/file:42\``. Without it, the comment
// stays a general MR note, as before.
const ANCHOR_RE = /^\s*\**Line:?\**:?\s*`?([^\s`]+?):(\d+)`?[ \t]*(?:\r?\n|$)/;

export function parseAnchor(text) {
  const m = ANCHOR_RE.exec(text);
  if (!m) return null;
  return { path: m[1], line: Number(m[2]), body: text.slice(m[0].length).trim() };
}

// GitLab only accepts a diff note on a line shown in the diff: an added line
// needs new_line, an unchanged context line needs both old_line and new_line.
// Returns null when the line is outside every hunk of this file's diff.
export function positionForLine(diff, newLine) {
  let oldNo = 0;
  let newNo = 0;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      continue;
    }
    if (!newNo || line.startsWith('\\')) continue;
    if (line.startsWith('+')) {
      if (newNo === newLine) return { new_line: newNo };
      newNo += 1;
    } else if (line.startsWith('-')) {
      oldNo += 1;
    } else {
      if (newNo === newLine) return { old_line: oldNo, new_line: newNo };
      oldNo += 1;
      newNo += 1;
    }
  }
  return null;
}
