import type { ReactNode } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

// One collapsible block of a review: the title is a real heading around the trigger.
export function CollapsibleCard({ id, title, open, onOpenChange, children }: { id: string; title: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Collapsible.Root id={id} open={open} onOpenChange={onOpenChange} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* A real heading around the trigger, so screen-reader users can jump between sections. */}
      <h2 className="text-base">
        <Collapsible.Trigger className="group flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left font-medium">
          <ChevronRight className={cn('size-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
          {title}
        </Collapsible.Trigger>
      </h2>
      <Collapsible.Content className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
