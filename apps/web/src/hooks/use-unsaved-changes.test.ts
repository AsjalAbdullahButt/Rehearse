import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { allowLeavingPage, confirmLeavingPage, useUnsavedChanges } from "./use-unsaved-changes";

describe("useUnsavedChanges", () => {
  it("guards reload only while there is unsaved work", () => {
    const { rerender, unmount } = renderHook(({ active }) => useUnsavedChanges(active, "Leave?"), {
      initialProps: { active: true },
    });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    rerender({ active: false });
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
    unmount();
  });

  it("allows a successful submission to navigate without discarding confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useUnsavedChanges(true, "Leave?"));
    expect(confirmLeavingPage()).toBe(false);
    act(() => result.current());
    expect(confirmLeavingPage()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("blocks same-document browser traversal through the Navigation API", () => {
    const navigation = new EventTarget();
    vi.stubGlobal("navigation", navigation);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedChanges(true, "Leave?"));
    const event = new Event("navigate", { cancelable: true });
    Object.defineProperty(event, "destination", { value: { sameDocument: true } });
    navigation.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps protecting edits until a navigation-causing mutation succeeds", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHook(() => useUnsavedChanges(true, "Leave?"));
    expect(confirmLeavingPage()).toBe(true);
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
    allowLeavingPage();
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  });
});
