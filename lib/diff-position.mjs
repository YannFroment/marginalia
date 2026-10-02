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
