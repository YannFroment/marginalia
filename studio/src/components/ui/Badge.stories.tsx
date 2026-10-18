import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check } from 'lucide-react';
import { Badge } from './Badge';

const meta = {
  title: 'Scholia/Feedback/Badge',
  component: Badge,
  args: { children: 'In pending review', tone: 'neutral', ring: false },
  argTypes: { tone: { control: 'select', options: ['neutral', 'info', 'success', 'warning', 'danger', 'violet'] } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Ringed: Story = { args: { tone: 'warning', ring: true, children: <><Check className="size-3" />In pending review</> } };
export const Tones: Story = {
  render: () => (
    <div className="space-y-3">
      {[false, true].map((ring) => (
        <div key={String(ring)} className="flex flex-wrap items-center gap-2">
          {(['neutral', 'info', 'success', 'warning', 'danger', 'violet'] as const).map((tone) => (
            <Badge key={tone} tone={tone} ring={ring}>{tone}</Badge>
          ))}
        </div>
      ))}
    </div>
  ),
};
