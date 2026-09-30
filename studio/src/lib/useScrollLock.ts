import { useEffect } from 'react';

// Freezes page scroll while a modal is open. Compensates for the scrollbar
// width so the layout doesn't jump. Counted, so nested/overlapping modals
// only release the lock when the last one closes.
let locks = 0;
let previous = { overflow: '', paddingRight: '' };

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const body = document.body;
    if (locks === 0) {
      previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) {
        body.style.overflow = previous.overflow;
        body.style.paddingRight = previous.paddingRight;
      }
    };
  }, [active]);
}
