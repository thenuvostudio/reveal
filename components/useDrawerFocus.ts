"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Keyboard focus for a slide-in drawer (the drawer itself is `inert` while closed, so Tab never reaches it):
 *  on open, focus moves to the drawer's close button; on close, it goes back to whatever had it before
 *  (normally the button that opened the drawer), or to `fallback` if that is gone or hidden. */
export function useDrawerFocus(open: boolean, drawer: RefObject<HTMLElement | null>, fallback: string) {
  const before = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const a = document.activeElement;
      before.current = a instanceof HTMLElement && !drawer.current?.contains(a) ? a : null;
      drawer.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      const a = document.activeElement;
      // only move focus if it was inside the drawer (or got dropped when the drawer became inert)
      if (!a || a === document.body || drawer.current?.contains(a)) {
        const back = before.current?.isConnected && before.current.checkVisibility?.() ? before.current : document.querySelector<HTMLElement>(fallback);
        back?.focus({ preventScroll: true });
      }
      before.current = null;
    }
    wasOpen.current = open;
  }, [open, drawer, fallback]);
}
