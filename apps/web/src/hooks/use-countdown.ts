"use client";

import { useEffect, useRef, useState } from "react";

/** Ticks `totalSeconds` down to 0 once per second while `isActive`, calling `onExpire` once
 * when it hits 0. `onExpire` is read through a ref so a caller passing a fresh closure each
 * render doesn't restart the interval — only `isActive`/`totalSeconds` do that. */
export function useCountdown(
  totalSeconds: number,
  isActive: boolean,
  onExpire: () => void,
): number {
  const [remaining, setRemaining] = useState(totalSeconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!isActive) return;
    setRemaining(totalSeconds);

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
  }, [isActive, totalSeconds]);

  return remaining;
}
