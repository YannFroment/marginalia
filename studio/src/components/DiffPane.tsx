import * as m from 'motion/react-m';
import type { Finding, Thread } from '../lib/api';
import type { DiffState } from '../lib/useMrDiff';
import { DiffFileView } from './DiffFileView';
import type { Focus } from '../lib/tourFocus';
import { DiffSkeleton } from './DiffSkeleton';
import { Button } from './ui/Button';
import type { DiffScope } from '../lib/useMrDiff';
import { cn } from '../lib/utils';

// Whole MR as that review saw it, or only what was pushed after it.
function ScopeToggle({ scope, onScope, old }: { scope: DiffScope; onScope: (mode: DiffScope['mode']) => void; old: boolean }) {
  const options = [['full', old ? 'At this review' : 'Whole MR'], ['since', old ? 'Since, up to now' : 'Since my review']] as const;
  return (
    <div role="group" aria-label="Which changes to show" className="mb-3 inline-flex rounded-md border border-zinc-200 p-0.5 text-xs dark:border-zinc-800">
      {options.map(([mode, label]) => (
        <button key={mode} aria-pressed={scope.mode === mode} onClick={() => onScope(mode)} className={cn('rounded px-2.5 py-1', scope.mode === mode ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-fg-muted hover:text-fg')}>{label}</button>
      ))}
    </div>
  );
}

// The code of the current stop: its files from the MR diff, findings inline.
export function DiffPane({ state, findings, focus, threads, scope, onScope, onSelectFinding, onRetry }: { state: DiffState; findings: Finding[]; threads: Thread[]; focus: Focus | null; scope: DiffScope; onScope: (mode: DiffScope['mode']) => void; onSelectFinding: (id: string) => void; onRetry: () => void }) {
  const toggle = <ScopeToggle scope={scope} onScope={onScope} old={scope.version !== null} />;
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <>{toggle}<DiffSkeleton /></>;
  if (state.status === 'error') {
    return (
      <>
        {toggle}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-4 text-sm text-fg-muted dark:border-zinc-800">
          <span>The diff could not be loaded ({state.message}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      </>
    );
  }
  const files = state.files;
  const since = scope.mode === 'since';
  // What a review found sits on the code as it stood then: it only lines up with a diff of that code.
  const inline = since ? [] : findings;
  return (
    <>
      {toggle}
      {state.approximate && <p className="mb-3 text-xs text-fg-subtle">This review did not record its version: the code shown is the one pushed just before it was written.</p>}
      {!files.length ? <p className="text-sm text-fg-muted">{since ? 'Nothing in this stop changed since that review.' : "None of this stop's files is in the MR diff."}</p> : (
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="space-y-3">
          {files.map((f, i) => <DiffFileView key={f.path} file={f} findings={inline} threads={since ? [] : threads} defaultOpen={i < 3} focus={focus} onSelectFinding={onSelectFinding} />)}
        </m.div>
      )}
    </>
  );
}
