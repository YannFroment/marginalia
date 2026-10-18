import type { Meta, StoryObj } from '@storybook/react-vite';
import { TabIcon } from './TabIcon';
import { approved, review } from '../stories/fixtures';

const meta = {
  title: 'Scholia/Feedback/TabIcon',
  component: TabIcon,
  args: { item: review, bot: undefined },
  argTypes: { bot: { control: 'select', options: [undefined, 'pending', 'reviewing', 'failed', 'skipped', 'up_to_date'] } },
} satisfies Meta<typeof TabIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

// With no bot activity the icon falls back to the review's verdict.
export const Verdict: Story = {};
export const Approved: Story = { args: { item: approved } };
export const Reviewing: Story = { args: { bot: 'reviewing' } };
export const Pending: Story = { args: { bot: 'pending' } };
export const Failed: Story = { args: { bot: 'failed' } };
