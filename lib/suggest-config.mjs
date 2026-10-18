import { join } from 'node:path';
import { ROOT } from './config.mjs';

// Settings of the suggested tickets (see .env.example), apart from config.mjs so
// the feature stays one you can read, or remove, on its own. Suggestions are
// drafted from the code of REPO_LOCAL_PATH and only reach Jira when you click Post.
export const {
  // Jira project the Post button creates the ticket in (empty: no suggestions).
  SUGGEST_JIRA_PROJECT = '',
  SUGGEST_ISSUE_TYPE = 'Story',
  // Labels put on a created ticket, comma-separated.
  SUGGEST_LABELS = '',
  // true lets the Post button create the ticket; otherwise suggestions are read-only.
  SUGGEST_ALLOW_CREATE = 'false',
  // A folder of markdown references the model judges the code against, one file per
  // principle; `node scripts/fetch-laws-of-ux.mjs <folder>` writes an example set.
  SUGGEST_REFERENCES_DIR = '',
  // A markdown file with the ticket template and writing rules to follow (default:
  // examples/ticket-template.md; a skill file works too).
  SUGGEST_TEMPLATE_FILE = '',
  // What to look for, in one sentence.
  SUGGEST_FOCUS = 'user experience problems in the interface',
  // Folders of the repo scanned in turn, one per run, comma-separated (empty: the whole repo).
  SUGGEST_AREAS = '',
  SUGGEST_COUNT = '4',
  SUGGEST_MODEL = 'opus',
  // Model that re-reads each draft against the code before it is shown (empty: no check).
  SUGGEST_VERIFY_MODEL = 'sonnet',
  // Automatic run every N hours (0: only when you click "Find suggestions").
  SUGGEST_EVERY_HOURS = '0',
} = process.env;

// An empty value in .env (as copied from .env.example) also falls back to the example template.
export const suggestTemplateFile = SUGGEST_TEMPLATE_FILE || join(ROOT, 'examples', 'ticket-template.md');
export const SUGGESTIONS_FILE = process.env.SUGGESTIONS_FILE || join(ROOT, 'suggestions.json');
export const SUGGEST_WORKTREE_DIR = process.env.SUGGEST_WORKTREE_DIR || join(ROOT, 'suggest-worktree');
export const suggestLabels = SUGGEST_LABELS.split(',').map((s) => s.trim()).filter(Boolean);
export const suggestAreas = SUGGEST_AREAS.split(',').map((s) => s.trim()).filter(Boolean);
export const suggestEnabled = Boolean(SUGGEST_JIRA_PROJECT);
export const createEnabled = suggestEnabled && SUGGEST_ALLOW_CREATE === 'true';
