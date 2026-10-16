// Pointing at a finding in a tour: the one on the left and its place in the diff on the right follow each other.
// `source` says where the click came from, so the other side is the one that moves.
export interface Focus {
  id: string;
  nonce: number;
  source: 'list' | 'diff';
}

// The nearest ancestor that really scrolls.
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

// Scrolls the pane that holds `el`, never the page: 'third' puts it a third of the way down (to read what is
// around it), 'nearest' only brings it into view. `inset` is the height of a sticky bar over the top of the pane.
export function scrollInPane(el: HTMLElement, where: 'third' | 'nearest' = 'third', inset = 0) {
  const pane = scrollParent(el);
  if (!pane) return;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const rect = el.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const top = rect.top - paneRect.top + pane.scrollTop;
  if (where === 'third') {
    pane.scrollTo({ top: Math.max(0, top - pane.clientHeight / 3), behavior });
  } else if (rect.top < paneRect.top + inset) {
    pane.scrollTo({ top: Math.max(0, top - inset - 8), behavior });
  } else if (rect.bottom > paneRect.bottom) {
    pane.scrollTo({ top: top + rect.height - pane.clientHeight + 8, behavior });
  }
}
