import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Options {
  /** Selector (inside the container) of the element to focus first; default: first focusable. */
  initial?: string;
  /** Where focus goes on close when the element that opened the modal is gone. */
  fallback?: RefObject<HTMLElement | null>;
}

// Focus management for a modal, so keyboard and screen-reader users are not
// left behind it: focus moves in on open, Tab / Shift+Tab wrap inside, and on
// close focus returns to whatever opened it (or to `fallback` if that element
// has since been removed).
export function useModalFocus(active: boolean, container: RefObject<HTMLElement | null>, { initial, fallback }: Options = {}) {
  useEffect(() => {
    const el = container.current;
    if (!active || !el) return undefined;

    const opener = document.activeElement as HTMLElement | null;
    const first = (initial ? el.querySelector<HTMLElement>(initial) : null) ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    if (first === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const inside = el.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === head)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === tail)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const back = opener && opener.isConnected && opener !== document.body ? opener : fallback?.current;
      back?.focus();
    };
    // Runs on open/close only; the refs and selectors are stable for a given modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
