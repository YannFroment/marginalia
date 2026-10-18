import { join } from 'node:path';
import { ROOT, GITLAB_PROJECT_ID } from './config.mjs';

// Settings of the Tickets tab (see .env.example), apart from config.mjs so the
// tab stays one feature you can read, or remove, on its own.
export const {
  // Jira project keys to list, comma-separated (empty: no tab).
  JIRA_TICKET_PROJECTS = '',
  // GitLab projects whose MRs are linked to tickets by the key they name, as
  // "path=manifest-name", comma-separated; the manifest name is the service's
  // line in PROD_MANIFEST. Default: the reviewed project, without a manifest name.
  TICKET_MR_PROJECTS = '',
  // Where the prod tags live, as "project:ref:path" (a YAML file of
  // "service: tag" lines). Empty: nothing is ever considered in prod.
  PROD_MANIFEST = '',
  // Final status per Jira project, "KEY=Status,KEY=Status". With
  // JIRA_AUTO_DONE=true, your tickets whose merged MRs are all in prod move there.
  JIRA_DONE_STATUSES = '',
  JIRA_AUTO_DONE = 'false',
  JIRA_POLL_MINUTES = '15',
  // Who the tab is for, in one sentence, read by the model that sorts tickets; and that model.
  TICKET_PROFILE = 'a front-end developer working on the web app',
  TICKET_CLASSIFY_MODEL = 'opus',
} = process.env;

export const TICKETS_FILE = join(ROOT, 'tickets.json');
export const TICKET_CLASSES_FILE = join(ROOT, 'ticket-classes.json');
export const JIRA_DONE_LOG = join(ROOT, 'jira-done.jsonl');

const list = (value = '') => value.split(',').map((s) => s.trim()).filter(Boolean);

export const ticketProjects = list(JIRA_TICKET_PROJECTS);
export const doneStatusOf = Object.fromEntries(list(JIRA_DONE_STATUSES).map((pair) => pair.split('=').map((s) => s.trim())).filter(([k, v]) => k && v));
export const mrProjects = list(TICKET_MR_PROJECTS || GITLAB_PROJECT_ID).map((entry) => {
  const [path, manifestName] = entry.split('=').map((s) => s.trim());
  return { path, id: encodeURIComponent(path), manifestName: manifestName || null };
});
