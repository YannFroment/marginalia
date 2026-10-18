import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check, Pencil, Send, Trash2 } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Scholia/Actions/Button',
  component: Button,
  args: { children: 'Cancel', variant: 'secondary', size: 'md', disabled: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};
// The one filled button in view: the main action of the screen or dialog.
export const Primary: Story = { args: { variant: 'primary', children: <><Send className="size-4" />Add to review</> } };
export const Ghost: Story = { args: { variant: 'ghost', size: 'sm', children: <><Pencil className="size-3.5" />Edit</> } };
export const Danger: Story = { args: { variant: 'danger', size: 'sm', children: <><Trash2 className="size-3.5" />Delete</> } };
export const Disabled: Story = { args: { variant: 'primary', disabled: true, children: 'Submit review' } };
export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      {(['md', 'sm'] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          <Button size={size} variant="primary"><Check className={size === 'sm' ? 'size-3.5' : 'size-4'} />Primary</Button>
          <Button size={size}>Secondary</Button>
          <Button size={size} variant="ghost">Ghost</Button>
          <Button size={size} variant="danger">Danger</Button>
        </div>
      ))}
    </div>
  ),
};
