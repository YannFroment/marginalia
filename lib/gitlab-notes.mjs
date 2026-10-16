import { positionForLine } from './diff-position.mjs';

// Pure readers of what the GitLab API returns about notes and discussions, kept
// apart from the requests so they can be tested on plain fixtures.

// GitLab's answer for a note or draft that is gone, as thrown by gitlabRequest().
export const isNotFound = (err) => / -> 404:/.test(String(err?.message));

const notePath = (n) => n.position?.new_path ?? n.position?.old_path ?? null;
const noteLine = (n) => n.position?.new_line ?? n.position?.old_line ?? null;

// GitLab names the users behind group and project access tokens
// group_<id>_bot_<hash> / project_<id>_bot_<hash> (review app links, CI notes):
// their notes are not reviewer feedback.
export function isBotAuthor(author) {
  return author?.bot === true || /^(group|project)_\d+_bot(_|$)/.test(author?.username ?? '');
}

// Time of the most recent note by someone other than `me` (system notes, bot
// notes and my own replies don't count), or null if no peer has commented at all.
export function latestPeerNoteAt(discussions, me) {
  let latest = null;
  for (const discussion of discussions) {
    for (const note of discussion.notes ?? []) {
      if (note.system || isBotAuthor(note.author) || note.author?.username === me) continue;
      const notedAt = new Date(note.updated_at).getTime();
      if (latest === null || notedAt > latest) latest = notedAt;
    }
  }
  return latest;
}

// The id of my note whose text is `body`, else null.
export function findNoteIdByBody(discussions, me, body) {
  for (const discussion of discussions) {
    const note = (discussion.notes ?? []).find((n) => !n.system && n.author?.username === me && n.body?.trim() === body.trim());
    if (note) return note.id;
  }
  return null;
}

// Discussion threads, human notes only (system notes such as "added 2 commits"
// are dropped), oldest first. `mine` marks the notes by `me`.
export function toDiscussions(discussions, me) {
  return discussions
    .map((d) => {
      const notes = (d.notes ?? []).filter((n) => !n.system).map((n) => ({
        id: n.id,
        author: n.author?.username ?? null,
        authorName: n.author?.name ?? null,
        mine: n.author?.username === me,
        body: n.body,
        at: n.created_at,
        path: notePath(n),
        line: noteLine(n),
      }));
      if (!notes.length) return null;
      const first = d.notes.find((n) => !n.system);
      return {
        id: d.id,
        resolved: Boolean(first?.resolvable && first.resolved),
        resolvable: Boolean(first?.resolvable),
        path: notes[0].path,
        line: notes[0].line,
        // Which side of the diff the line is on, and the head commit the thread was opened on.
        side: first.position?.new_line != null ? 'new' : first.position?.old_line != null ? 'old' : null,
        headSha: first.position?.head_sha ?? null,
        notes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.notes[0].at) - new Date(b.notes[0].at));
}

export const toDraft = (d) => ({ id: d.id, body: d.note, path: notePath(d), line: noteLine(d) });

// The diff position of path:line, from the MR's diff_refs and its diff files. An
// unchanged line shown as context needs its old line number too, else GitLab
// refuses the note; a renamed file needs its old path. Without `line` the note
// is attached to the whole file.
export function diffPosition(refs, files, path, line) {
  const file = files.find((f) => f.new_path === path);
  const lines = line && file ? positionForLine(file.diff, line) : null;
  return {
    position_type: line ? 'text' : 'file',
    base_sha: refs.base_sha,
    start_sha: refs.start_sha,
    head_sha: refs.head_sha,
    old_path: file?.old_path ?? path,
    new_path: path,
    ...(line ? lines ?? { new_line: line } : {}),
  };
}
