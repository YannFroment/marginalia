import { useState } from 'react';
import { Clock, FlaskConical, GitCompare, Loader2, Microscope, SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import { requestAction, showDiffInIde, type ActionKind, type ReviewItem } from '../lib/api';
import type { BotState } from './TabIcon';

type ActionState = 'idle' | 'queued' | 'running';

const ACTION_UI: Record<ActionKind, { Icon: typeof Microscope; label: Record<ActionState, string>; title: string }> = {
  deepen: {
    Icon: Microscope,
    label: { idle: 'Deep review', queued: 'Deep review queued', running: 'Deep review running…' },
    title: 'Runs the slower checks the automatic pass skips (type check, tests), then rewrites this review.',
  },
  qa: {
    Icon: FlaskConical,
    label: { idle: 'Run QA', queued: 'QA queued', running: 'QA running…' },
    title: 'QA of the running app, not of the code: adversarial scenarios on the review app, in a browser. The result is added as a QA section at the end of this review.',
  },
};

const BUTTON = 'touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800';
const formatRunAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function ActionButton({ slug, action, state }: { slug: string; action: ActionKind; state: ActionState }) {
  const { Icon, label, title } = ACTION_UI[action];
  const start = async () => {
    try {
      const r = await requestAction(slug, action);
      toast.info(r.state === 'started' ? `${label.running.replace('…', '')} on !${r.iid}` : `${label.queued} on !${r.iid}: it starts after the running review`);
    } catch (e) {
      toast.error(`Could not start: ${label.idle}`, { description: (e as Error).message });
    }
  };
  return (
    <button disabled={state !== 'idle'} onClick={start} title={title} className={BUTTON}>
      {state === 'running' ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" aria-hidden /> : state === 'queued' ? <Clock className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {label[state]}
    </button>
  );
}

// Our tools on one review: on-demand runs, the MR's worktree in the IDE, the bot's
// session in a terminal. The chat that resumes it sits at the bottom of the review.
export function ReviewerTools({ item, diffInIdeEnabled, deepenEnabled, qaEnabled, botState }: { item: ReviewItem; diffInIdeEnabled: boolean; deepenEnabled: boolean; qaEnabled: boolean; botState: BotState | undefined }) {
  const [openingDiff, setOpeningDiff] = useState(false);
  const openDiff = async () => {
    setOpeningDiff(true);
    try {
      const { owned } = await showDiffInIde(item.slug);
      toast.success(owned ? 'Opened in your IDE: the MR changes are in source control' : 'Opened your own worktree in your IDE, as it is');
    } catch (e) {
      toast.error('Could not open the IDE', { description: (e as Error).message });
    } finally {
      setOpeningDiff(false);
    }
  };
  const copyResume = async () => {
    try {
      await navigator.clipboard.writeText(item.resumeCommand!);
      toast.success('Command copied: paste it in a terminal to talk with the bot', { description: item.resumeCommand! });
    } catch {
      toast.error('Could not copy: clipboard access was denied', { description: item.resumeCommand! });
    }
  };
  if (!item.tracked && !item.resumeCommand) return null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {diffInIdeEnabled && item.tracked && (
          <button onClick={openDiff} disabled={openingDiff} aria-busy={openingDiff} title="Opens the MR's worktree in your IDE, with the MR's changes shown as uncommitted in source control." className={BUTTON}>
            {openingDiff ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" aria-hidden /> : <GitCompare className="size-3.5" aria-hidden />}
            {openingDiff ? 'Opening…' : 'Show diff in IDE'}
          </button>
        )}
        {deepenEnabled && item.tracked && <ActionButton slug={item.slug} action="deepen" state={botState === 'deepening' ? 'running' : botState === 'deepen-queued' ? 'queued' : 'idle'} />}
        {qaEnabled && item.tracked && <ActionButton slug={item.slug} action="qa" state={botState === 'testing' ? 'running' : botState === 'qa-queued' ? 'queued' : 'idle'} />}
        {item.resumeCommand && (
          <button onClick={copyResume} title="Copies the command that resumes, in your terminal, the Claude session of the latest run on this MR." className={BUTTON}>
            <SquareTerminal className="size-3.5" aria-hidden />Continue in terminal
          </button>
        )}
        {item.lastDeepAt && <span className="text-xs text-fg-muted">Deep review on {formatRunAt(item.lastDeepAt)}</span>}
        {item.lastQaAt && <span className="text-xs text-fg-muted">QA run on {formatRunAt(item.lastQaAt)}</span>}
      </div>
    </div>
  );
}
