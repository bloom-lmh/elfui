import { describe, expect, it, vi } from "vitest";

import {
  callHooks,
  callMountedCleanups,
  createInstance,
  onMounted,
  setCurrentInstance
} from "../lifecycle";

describe("lifecycle hook allocation", () => {
  it("shares hookless arrays and detaches only the list that receives a hook", () => {
    const first = createInstance(document.createElement("div"), null);
    const second = createInstance(document.createElement("div"), null);
    const hookLists = (instance: typeof first): unknown[][] => [
      instance.beforeMountHooks,
      instance.mountedHooks,
      instance.mountedCleanupHooks,
      instance.beforeUnmountHooks,
      instance.unmountedHooks,
      instance.beforeUpdateHooks,
      instance.updatedHooks,
      instance.attrChangedHooks,
      instance.errorCapturedHooks,
      instance.activatedHooks,
      instance.deactivatedHooks
    ];

    expect(new Set([...hookLists(first), ...hookLists(second)]).size).toBe(1);
    expect(Object.isFrozen(first.mountedHooks)).toBe(true);

    const hook = vi.fn();
    const previous = setCurrentInstance(first);
    try {
      onMounted(hook);
    } finally {
      setCurrentInstance(previous);
    }

    expect(first.mountedHooks).not.toBe(second.mountedHooks);
    expect(first.mountedHooks).toEqual([hook]);
    expect(second.mountedHooks).toHaveLength(0);
    expect(first.unmountedHooks).toBe(second.unmountedHooks);
  });

  it("recycles mounted cleanup storage while preserving reverse cleanup order", () => {
    const instance = createInstance(document.createElement("div"), null);
    const calls: number[] = [];

    callHooks([() => () => calls.push(1), () => () => calls.push(2)], instance, "mounted", true);
    expect(instance.mountedCleanupHooks).toHaveLength(2);

    callMountedCleanups(instance);
    expect(calls).toEqual([2, 1]);
    expect(instance.mountedCleanupHooks).toHaveLength(0);
    expect(Object.isFrozen(instance.mountedCleanupHooks)).toBe(true);
  });
});
