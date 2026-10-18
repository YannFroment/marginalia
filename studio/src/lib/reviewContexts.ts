import { createContext } from 'react';
import type { Finding, PostedInfo } from './api';

export interface PostContextValue {
  allowPosting: boolean;
  slug: string | null;
  iid: string | number | null;
  posted: Record<string, PostedInfo>;
  reload: () => void;
  // A re-run is queued or running: the comments on screen are about to be replaced.
  locked: boolean;
  // What the bot read out of this review, to give a comment the id of its finding.
  findings: Finding[];
}
export const PostContext = createContext<PostContextValue>({ allowPosting: false, slug: null, iid: null, posted: {}, reload: () => {}, locked: false, findings: [] });
// The markdown a blockquote's `position.start.offset` refers to (one section body, not the whole review).
export const SourceContext = createContext('');
