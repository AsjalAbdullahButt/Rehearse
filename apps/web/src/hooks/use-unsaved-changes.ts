"use client";

import { useCallback, useEffect, useRef } from "react";

const LEAVE_EVENT = "rehearse:before-leave";
const ALLOW_EVENT = "rehearse:allow-leave";

/** Buttons that navigate after a mutation must check before mutating. */
export function confirmLeavingPage(): boolean {
  return window.dispatchEvent(new Event(LEAVE_EVENT, { cancelable: true }));
}

/** Release guards only after a navigation-causing mutation has succeeded. */
export function allowLeavingPage(): void {
  window.dispatchEvent(new Event(ALLOW_EVENT));
}

export function useUnsavedChanges(active: boolean, message: string): () => void {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });

  useEffect(() => {
    function confirm(event: Event) {
      if (!activeRef.current) return;
      if (!window.confirm(message)) event.preventDefault();
      else if (event.type !== LEAVE_EVENT) activeRef.current = false;
    }
    function allow() {
      activeRef.current = false;
    }
    function unload(event: BeforeUnloadEvent) {
      if (!activeRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    // Covers same-document links AND browser back/forward where supported.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    function navigate(event: Event) {
      const transition = event as Event & {
        destination?: { sameDocument: boolean };
        hashChange?: boolean;
      };
      if (event.cancelable && transition.destination?.sameDocument && !transition.hashChange)
        confirm(event);
    }
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const target = new URL(link.href);
      if (target.pathname === location.pathname && target.search === location.search && target.hash)
        return;
      confirm(event);
      if (event.defaultPrevented) event.stopPropagation();
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener(LEAVE_EVENT, confirm);
    window.addEventListener(ALLOW_EVENT, allow);
    if (navigation) navigation.addEventListener("navigate", navigate);
    else document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener(LEAVE_EVENT, confirm);
      window.removeEventListener(ALLOW_EVENT, allow);
      navigation?.removeEventListener("navigate", navigate);
      document.removeEventListener("click", click, true);
    };
  }, [message]);

  return useCallback(() => {
    activeRef.current = false;
  }, []);
}
