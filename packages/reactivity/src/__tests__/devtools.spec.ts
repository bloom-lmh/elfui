import { afterEach, describe, expect, it } from "vitest";

import { nextTick } from "../scheduler";
import { useEffect } from "../use-effect";
import { useRef } from "../state";
import { useComputed } from "../computed";

const COMPONENT_CONTEXT_KEY = Symbol.for("elfui.devtools.component-context");

describe("reactivity devtools instrumentation", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__;
    delete (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY];
  });

  it("links a named state trigger to its scheduled component effect", async () => {
    const events: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitReactivityEvent: (event: Record<string, unknown>) => events.push(event)
    };
    (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY] =
      "elfui-component:test";
    const count = useRef(0, "count");
    const stop = useEffect(
      () => {
        void count.value;
      },
      { flush: "pre" }
    );
    delete (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY];

    count.value = 1;
    await nextTick();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "reactivity:trigger",
      targetName: "count",
      key: "value",
      effects: [{ componentId: "elfui-component:test" }]
    });
    expect(events[1]).toMatchObject({
      type: "reactivity:effect",
      triggerId: events[0]!.id,
      componentId: "elfui-component:test"
    });
    expect(events[1]!.duration).toEqual(expect.any(Number));
    stop();
  });

  it("preserves parent trigger ids through computed invalidation", () => {
    const events: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitReactivityEvent: (event: Record<string, unknown>) => events.push(event)
    };
    (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY] =
      "elfui-component:computed";
    const count = useRef(1, "count");
    const doubled = useComputed(() => count.value * 2);
    const stop = useEffect(() => {
      void doubled.value;
    });
    delete (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY];

    count.value = 2;

    const triggers = events.filter((event) => event.type === "reactivity:trigger");
    expect(triggers).toHaveLength(2);
    expect(triggers[1]!.parentTriggerId).toBe(triggers[0]!.id);
    expect(
      events.filter((event) => event.type === "reactivity:effect").map((event) => event.triggerId)
    ).toEqual(expect.arrayContaining([triggers[0]!.id, triggers[1]!.id]));
    stop();
  });
});
