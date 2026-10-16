import type { Meta, StoryObj } from '@storybook/react-vite';

// Tokens as documented in DESIGN.md ("The Reading Desk"). The app consumes them
// through Tailwind's zinc / blue / red / emerald / amber / violet scales.
const meta = { title: 'Scholia/Foundations', parameters: { layout: 'padded' }, tags: ['!autodocs'] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

type Swatch = { name: string; value: string; use: string };

const NEUTRALS: Swatch[] = [
  { name: 'Canvas', value: 'oklch(98.5% 0 0)', use: 'Page background (light)' },
  { name: 'Canvas dark', value: 'oklch(14.1% 0.005 285.823)', use: 'Page background (dark)' },
  { name: 'Surface', value: '#ffffff', use: 'Cards, dialogs (light)' },
  { name: 'Surface dark', value: 'oklch(21% 0.006 285.885)', use: 'Cards, dialogs (dark)' },
  { name: 'Line', value: 'oklch(92% 0.004 286.32)', use: 'One-pixel separators (light)' },
  { name: 'Line dark', value: 'oklch(27.4% 0.006 286.033)', use: 'One-pixel separators (dark)' },
  { name: 'Text muted', value: 'oklch(44.2% 0.017 285.786)', use: 'Secondary copy, ≥ 6:1 (light)' },
  { name: 'Text muted dark', value: 'oklch(70.5% 0.015 286.067)', use: 'Secondary copy, ≥ 6:1 (dark)' },
  { name: 'Text subtle', value: 'oklch(55.2% 0.016 285.938)', use: 'Icons and marks only, never sentences' },
];
const SIGNALS: Swatch[] = [
  { name: 'Signal blue', value: 'oklch(62.3% 0.214 259.815)', use: 'Selection, unread, focus, active tab' },
  { name: 'Action blue', value: 'oklch(54.6% 0.245 262.881)', use: 'The one primary button in view' },
  { name: 'Changes red', value: 'oklch(57.7% 0.245 27.325)', use: 'Request changes, critical' },
  { name: 'Approved green', value: 'oklch(59.6% 0.145 163.225)', use: 'Approve, posted' },
  { name: 'Important amber', value: 'oklch(55.5% 0.163 48.998)', use: 'Important findings, pending review' },
  { name: 'Semantic violet', value: 'oklch(49.1% 0.27 292.581)', use: 'Semantic typography, triage' },
];

function Swatches({ items }: { items: Swatch[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
      {items.map((s) => (
        <li key={s.name} className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-14 border-b border-zinc-200 dark:border-zinc-800" style={{ background: s.value }} aria-hidden />
          <div className="p-3 text-sm">
            <p className="font-medium">{s.name}</p>
            <p className="mt-0.5 font-mono text-xs text-fg-muted">{s.value}</p>
            <p className="mt-1 text-xs text-fg-muted">{s.use}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const Heading = ({ children }: { children: string }) => <h2 className="mb-3 mt-8 text-base font-semibold first:mt-0">{children}</h2>;

export const Colors: Story = {
  render: () => (
    <div>
      <Heading>Graphite neutrals</Heading>
      <Swatches items={NEUTRALS} />
      <Heading>Signals</Heading>
      <Swatches items={SIGNALS} />
      <p className="mt-6 max-w-prose text-sm text-fg-muted">Status is always double-coded: a colour plus an icon or a word, never colour alone. Light and dark are composed separately, not inverted; the app follows the OS setting.</p>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-fg-muted">Interface · system sans</p>
        <p className="text-3xl font-semibold tracking-tight">Display 1.875rem / 600</p>
        <p className="text-2xl font-semibold tracking-tight">Title 1.5rem / 600</p>
        <p className="text-base font-medium">Heading 1rem / 500</p>
        <p className="text-sm">Body 0.875rem: the default for controls and lists.</p>
        <p className="text-xs text-fg-muted">Label 0.75rem: metadata, counters, badges.</p>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-fg-muted">Code · mono</p>
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm dark:bg-zinc-800">studio/server.mjs:301</code>
      </div>
    </div>
  ),
};

export const RadiiAndSpacing: Story = {
  name: 'Radii & spacing',
  render: () => (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {[['md', 'rounded-md', '6px'], ['lg', 'rounded-lg', '8px'], ['xl', 'rounded-xl', '12px'], ['full', 'rounded-full', '9999px']].map(([name, cls, px]) => (
          <div key={name} className="text-center text-xs">
            <div className={`mb-1 size-16 border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 ${cls}`} />
            {name} · {px}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {[['xs', 4], ['sm', 8], ['md', 12], ['lg', 16], ['xl', 24]].map(([name, px]) => (
          <div key={name} className="text-center text-xs">
            <div className="mb-1 bg-blue-500/60" style={{ width: Number(px), height: Number(px) }} />
            {name} · {px}px
          </div>
        ))}
      </div>
    </div>
  ),
};
