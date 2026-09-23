"use client";

import { useEffect, useRef, useState } from "react";

/** Ticks `totalSeconds` down to 0 once per second while `isActive`, calling `onExpire` once
 * when it hits 0. */
export function useCountdown(
  totalSeconds: number,
  isActive: boolean,
  onExpire: () => void,
): number {
  const [remaining, setRemaining] = useState(totalSeconds);

  // Reset the countdown the moment `isActive` flips to true — done as a guarded state update
  // during render (React's documented pattern for "adjusting state when a prop changes"),
  // not inside a useEffect, which the newer react-hooks rules flag as a cascading-render risk.
  const [wasActive, setWasActive] = useState(isActive);
  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive) setRemaining(totalSeconds);
  }

  // onExpire is read through a ref, kept in sync after each commit (not during render, which
  // react-hooks/refs forbids), so a caller passing a fresh closure each render doesn't need
  // to be a dependency of the interval effect below.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setRemaining((previous) => {
        if (previous <= 1) {
          // Stop ticking immediately — otherwise this keeps firing onExpire every second
          // after hitting 0, since clearing only on unmount/dep-change is too late.
          clearInterval(interval);
          onExpireRef.current();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  return remaining;
}
