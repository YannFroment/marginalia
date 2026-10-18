import type { Meta, StoryObj } from '@storybook/react-vite';
import { VerdictBadge } from './VerdictBadge';

const meta = {
  title: 'Scholia/Feedback/VerdictBadge',
  component: VerdictBadge,
  args: { verdict: 'APPROVE', compact: false },
  argTypes: { verdict: { control: 'inline-radio', options: ['APPROVE', 'REQUEST_CHANGES', 'OTHER', null] } },
} satisfies Meta<typeof VerdictBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Approve: Story = {};
export const RequestChanges: Story = { args: { verdict: 'REQUEST_CHANGES' } };
export const Other: Story = { args: { verdict: 'OTHER' } };
// A bare icon for dense layouts: colour carries the verdict, the label stays for screen readers.
export const Compact: Story = { args: { compact: true } };
export const AllVerdicts: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(['APPROVE', 'REQUEST_CHANGES', 'OTHER'] as const).map((v) => (
        <VerdictBadge key={v} verdict={v} />
      ))}
    </div>
  ),
};
