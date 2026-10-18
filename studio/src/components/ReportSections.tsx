import { Fragment, type Dispatch, type SetStateAction } from 'react';
import type { Section } from '../lib/reviewSections';
import { CollapsibleCard } from './CollapsibleCard';
import { GlanceBody, Md } from './ReviewMarkdown';

// The sections of the written report, as collapsible cards, the supporting ones after a label.
export function ReportSections({ intro, sections, firstSupporting, isOpen, setOverrides }: {
  intro: string;
  sections: Section[];
  firstSupporting: string | undefined;
  isOpen: (s: Section) => boolean;
  setOverrides: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <>
      {intro.trim() && <Md>{intro}</Md>}
      {sections.map((s) => (
        <Fragment key={s.id}>
          {s.id === firstSupporting && <p className="px-1 pt-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">Supporting detail</p>}
          <CollapsibleCard id={s.id} title={s.title} open={isOpen(s)} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, [s.id]: o }))}>
            {/at a glance/i.test(s.title) ? <GlanceBody body={s.body} /> : <Md>{s.body}</Md>}
          </CollapsibleCard>
        </Fragment>
      ))}
    </>
  );
}
