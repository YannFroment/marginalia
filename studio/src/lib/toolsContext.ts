import { createContext } from 'react';
import type { CommentRef } from './comments';

// Our tools on a comment card: ask the bot about it (the chat at the bottom of the
// review), and open the file it is anchored on in the IDE. Null when unavailable.
export interface ToolsContextValue {
  askAbout: ((about: CommentRef) => void) | null;
  openInIde: ((path: string, line: number) => void) | null;
}
export const ToolsContext = createContext<ToolsContextValue>({ askAbout: null, openInIde: null });
