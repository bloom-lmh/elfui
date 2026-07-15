import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "@elfui/reactivity";

import { text } from "../bindings";
import { show } from "../control-flow";
import { setDevtoolsComponentContext } from "../devtools";
import { createInstance, runWithUpdateHooks } from "../lifecycle";

describe("development DevTools hook", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__;
    setDevtoolsComponentContext(null);
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

  it("attaches binding kind and template location to reactive effects", () => {
    const events: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitReactivityEvent: (event: Record<string, unknown>) => events.push(event)
    };
    setDevtoolsComponentContext("elfui-component:binding");
    const count = useRef(0, "count");
    const node = document.createTextNode("");
    text(node, () => count.value, { source: { line: 3, column: 7 } });
    setDevtoolsComponentContext(null);

    count.value = 1;

    expect(events[0]).toMatchObject({
      type: "reactivity:trigger",
      effects: [
        {
          componentId: "elfui-component:binding",
          debug: {
            kind: "binding",
            name: "text",
            source: { line: 3, column: 7 }
          }
        }
      ]
    });
  });

  it("attaches control-flow names and template locations to effects", () => {
    const events: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitReactivityEvent: (event: Record<string, unknown>) => events.push(event)
    };
    setDevtoolsComponentContext("elfui-component:flow");
    const visible = useRef(true, "visible");
    const element = document.createElement("div");
    show(element, () => visible.value, {
      name: "v-show",
      source: { line: 6, column: 9 }
    });
    setDevtoolsComponentContext(null);

    visible.value = false;

    expect(events[0]).toMatchObject({
      type: "reactivity:trigger",
      effects: [
        {
          componentId: "elfui-component:flow",
          debug: {
            kind: "binding",
            name: "v-show",
            source: { line: 6, column: 9 }
          }
        }
      ]
    });
  });
});
