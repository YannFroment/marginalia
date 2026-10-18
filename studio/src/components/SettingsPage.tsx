import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { saveSettings, type Settings } from '../lib/api';
import { Button } from './ui/Button';

type Draft = { pollIntervalMinutes: string; staleAfterDays: string; allowedTargetBranches: string; excludeAuthors: string };

const toDraft = (s: Settings): Draft => ({
  pollIntervalMinutes: String(s.pollIntervalMinutes),
  staleAfterDays: String(s.staleAfterDays),
  allowedTargetBranches: s.allowedTargetBranches.join(', '),
  excludeAuthors: s.excludeAuthors.join(', '),
});
const toList = (v: string) => [...new Set(v.split(/[,\s]+/).filter(Boolean))];

const FIELDS: { key: keyof Draft; label: string; hint: string; list?: boolean; placeholder?: string }[] = [
  { key: 'pollIntervalMinutes', label: 'Poll every (minutes)', hint: 'How often the bot looks for new or updated MRs. 1 to 1440.' },
  { key: 'staleAfterDays', label: 'Skip MRs idle for (days)', hint: 'No push or comment for this long and the MR is assumed stale. 1 to 365.' },
  { key: 'allowedTargetBranches', label: 'Target branches', hint: 'Only MRs based on these branches are reviewed. Empty reviews all of them.', list: true, placeholder: 'develop, main' },
  { key: 'excludeAuthors', label: 'Excluded authors', hint: 'GitLab usernames (not emails) whose MRs are never touched. Drafts are always skipped.', list: true, placeholder: 'alice, bob' },
];

function patchOf(draft: Draft) {
  return {
    pollIntervalMinutes: Number(draft.pollIntervalMinutes),
    staleAfterDays: Number(draft.staleAfterDays),
    allowedTargetBranches: toList(draft.allowedTargetBranches),
    excludeAuthors: toList(draft.excludeAuthors),
  };
}

// Everything here is read fresh by the bot on its next poll: no restart. Secrets, paths and the
// ALLOW_POSTING / ALLOW_PUSH gates stay in .env on purpose.
export function SettingsPage({ settings, defaults }: { settings: Settings | null; defaults: Settings | null }) {
  const [draft, setDraft] = useState<Draft | null>(settings && toDraft(settings));
  const [saving, setSaving] = useState(false);
  // The server's values arrive after the first paint, and change when saved from elsewhere.
  const saved = settings ? JSON.stringify(toDraft(settings)) : null;
  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !settings || !defaults) return <div className="mx-auto max-w-2xl px-6 py-8 text-fg-muted">Loading settings…</div>;

  const dirty = JSON.stringify(draft) !== saved;
  const defaultDraft = toDraft(defaults);
  const save = async (patch: Parameters<typeof saveSettings>[0], message: string) => {
    setSaving(true);
    try {
      await saveSettings(patch);
      toast.success(message, { description: 'Applied by the bot on its next poll.' });
    } catch (err) {
      toast.error('Could not save the settings', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mx-auto max-w-2xl px-6 py-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save(patchOf(draft), 'Settings saved');
      }}
    >
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-fg-muted">
        Saved to <code>settings.json</code> and applied without a restart. Each value overrides <code>.env</code>, which stays the default.
      </p>

      <div className="mt-8 space-y-6">
        {FIELDS.map((f) => {
          const id = `setting-${f.key}`;
          const changedFromDefault = draft[f.key] !== defaultDraft[f.key];
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block text-sm font-medium">{f.label}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id={id}
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  inputMode={f.list ? undefined : 'numeric'}
                  placeholder={f.placeholder}
                  aria-describedby={`${id}-hint`}
                  className="touch-target w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-800 dark:bg-zinc-900"
                />
                {changedFromDefault && (
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save({ [f.key]: null }, `${f.label} back to the .env default`)} title={`Back to the .env default (${defaultDraft[f.key] || 'empty'})`}>
                    <RotateCcw className="size-3.5" />Default
                  </Button>
                )}
              </div>
              <p id={`${id}-hint`} className="mt-1 text-xs text-fg-muted">{f.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {dirty && <Button variant="ghost" onClick={() => setDraft(toDraft(settings))}>Discard changes</Button>}
      </div>
    </form>
  );
}
