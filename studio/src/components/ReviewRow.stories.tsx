import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewRow } from './ReviewRow';
import { approved, other, review } from '../stories/fixtures';

const meta = {
  title: 'Scholia/Data display/ReviewRow',
  component: ReviewRow,
  args: { item: review, unread: false },
  decorators: [(Story) => <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"><Story /></ul>],
} satisfies Meta<typeof ReviewRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Read: Story = {};
export const Unread: Story = { args: { unread: true } };
export const List: Story = {
  render: () => (
    <>
      <ReviewRow item={review} unread />
      <ReviewRow item={approved} unread={false} />
      <ReviewRow item={other} unread={false} />
    </>
  ),
};
