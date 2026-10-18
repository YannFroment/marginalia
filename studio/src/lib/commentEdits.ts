// Edits survive collapsing a section or reloading; keyed by the original text.
export const editKey = (original: string) => {
  let h = 0;
  for (let i = 0; i < original.length; i += 1) h = (h * 31 + original.charCodeAt(i)) | 0;
  return `mr-review-viewer:edit:${h}`;
};
export const readEdit = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const writeEdit = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};
