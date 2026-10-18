import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

// Light/dark follows the OS (the app uses prefers-color-scheme, not a class):
// emulate it from the browser's rendering tools to check both themes.
const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { matchers: { date: /At$/ } },
    a11y: { test: 'todo' },
  },
};
export default preview;
