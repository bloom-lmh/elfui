import { afterEach, describe, expect, it, vi } from "vitest";

import { createInstance, runWithUpdateHooks } from "../lifecycle";

describe("development DevTools hook", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__;
  });

  it("coalesces binding updates for one component in a microtask", async () => {
    const emitRuntimeEvent = vi.fn();
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitRuntimeEvent
    };
    const host = document.createElement("elf-counter");
    const instance = createInstance(host, null);
    instance.isMounted = true;
    const update = vi.fn();

    runWithUpdateHooks(instance, update);
    runWithUpdateHooks(instance, update);
    expect(update).toHaveBeenCalledTimes(2);
    expect(emitRuntimeEvent).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(emitRuntimeEvent).toHaveBeenCalledTimes(1);
    expect(emitRuntimeEvent).toHaveBeenCalledWith({ type: "component:update", host });
  });
});
