// Pure helpers behind the studio's diff pane: GitLab's per-file unified diffs
// become numbered lines, and the paths or globs of a tour stop pick their files.

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@\s?(.*)$/;

// A unified diff as lines: { t: 'hunk', text } or { t: 'add' | 'del' | 'ctx', old, new, text }.
// `old` is null on an added line and `new` on a deleted one.
export function parseDiff(diff) {
  const lines = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of String(diff ?? '').split('\n')) {
    const hunk = HUNK.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      lines.push({ t: 'hunk', text: raw });
    } else if (!newNo || raw.startsWith('\\')) {
      continue;
    } else if (raw.startsWith('+')) {
      lines.push({ t: 'add', old: null, new: newNo++, text: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      lines.push({ t: 'del', old: oldNo++, new: null, text: raw.slice(1) });
    } else {
      lines.push({ t: 'ctx', old: oldNo++, new: newNo++, text: raw.slice(1) });
    }
  }
  while (lines.at(-1)?.t === 'ctx' && lines.at(-1).text === '') lines.pop();
  return lines;
}

// One changed file as the studio shows it. GitLab leaves `diff` empty for a file
// it considers too large or collapsed: `omitted` says so instead of showing nothing.
export function toDiffFile(f) {
  const lines = parseDiff(f.diff);
  return {
    path: f.new_path,
    oldPath: f.old_path !== f.new_path ? f.old_path : null,
    status: f.new_file ? 'added' : f.deleted_file ? 'deleted' : f.renamed_file ? 'renamed' : 'modified',
    additions: lines.filter((l) => l.t === 'add').length,
    deletions: lines.filter((l) => l.t === 'del').length,
    omitted: !f.diff && !f.renamed_file && !f.deleted_file,
    lines,
  };
}

// `*` stays inside a directory, `**` crosses them; anything else is literal.
export function globToRegExp(glob) {
  const body = glob
    .split('**')
    .map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

// The changed files a stop covers, in the order the stop lists them, each once.
export function filesForPatterns(files, patterns) {
  const seen = new Set();
  const out = [];
  for (const pattern of patterns) {
    const re = globToRegExp(pattern);
    for (const f of files) {
      if (seen.has(f.path) || !re.test(f.path)) continue;
      seen.add(f.path);
      out.push(f);
    }
  }
  return out;
}
