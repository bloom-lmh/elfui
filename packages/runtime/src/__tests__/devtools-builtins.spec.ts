import { afterEach, describe, expect, it } from "vitest";
import { useRef } from "@elfui/reactivity";

import { dynamicComponent } from "../builtin";
import { mark } from "../control-flow";
import type { ElfUIDevtoolsRuntimeEvent } from "../devtools";
import { defineCustomElement } from "../element";
import { suspense } from "../suspense";

let tagId = 0;
const nextTag = (name: string): string => `elf-devtools-${name}-${++tagId}`;
const tick = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

const mountEvents = (
  events: ElfUIDevtoolsRuntimeEvent[]
): Extract<ElfUIDevtoolsRuntimeEvent, { type: "component:mount" }>[] =>
  events.filter(
    (event): event is Extract<ElfUIDevtoolsRuntimeEvent, { type: "component:mount" }> =>
      event.type === "component:mount"
  );

describe("DevTools built-in component fixtures", () => {
  const events: ElfUIDevtoolsRuntimeEvent[] = [];

  afterEach(() => {
    document.body.replaceChildren();
    delete (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__;
    events.length = 0;
  });

  const installHook = (): void => {
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitRuntimeEvent: (event: ElfUIDevtoolsRuntimeEvent) => events.push(event)
    };
  };

  it("keeps dynamic replacement children under the logical owner", async () => {
    installHook();
    const firstTag = nextTag("dynamic-a");
    const secondTag = nextTag("dynamic-b");
    const parentTag = nextTag("dynamic-parent");
    defineCustomElement({ tag: firstTag, render: () => document.createTextNode("a") });
    defineCustomElement({ tag: secondTag, render: () => document.createTextNode("b") });
    const activeTag = useRef<string | null>(firstTag);
    defineCustomElement({
      tag: parentTag,
      render: () => dynamicComponent(() => activeTag.value)
    });

    const parent = document.createElement(parentTag);
    document.body.appendChild(parent);
    await tick();

    const initialMounts = mountEvents(events);
    const parentMount = initialMounts.find((event) => event.component.tag === parentTag);
    const firstMount = initialMounts.find((event) => event.component.tag === firstTag);
    expect(firstMount?.component.parentId).toBe(parentMount?.component.id);

    activeTag.value = secondTag;
    await tick();
    const mountsAfterSwitch = mountEvents(events);
    const secondMount = mountsAfterSwitch.find((event) => event.component.tag === secondTag);
    expect(secondMount?.component.parentId).toBe(parentMount?.component.id);
    expect(
      events.some(
        (event) => event.type === "component:unmount" && event.host === firstMount?.component.host
      )
    ).toBe(true);

    parent.remove();
    await tick();
    expect(
      events.some(
        (event) => event.type === "component:unmount" && event.host === secondMount?.component.host
      )
    ).toBe(true);
  });

  it("replaces a Suspense fallback without losing its logical owner", async () => {
    installHook();
    const fallbackTag = nextTag("suspense-fallback");
    const resolvedTag = nextTag("suspense-resolved");
    const parentTag = nextTag("suspense-parent");
    defineCustomElement({ tag: fallbackTag, render: () => document.createTextNode("loading") });
    defineCustomElement({ tag: resolvedTag, render: () => document.createTextNode("ready") });
    let resolveSource: () => void = () => {};
    const source = new Promise<void>((resolve) => {
      resolveSource = resolve;
    });
    defineCustomElement({
      tag: parentTag,
      render: () => {
        const anchor = mark("suspense");
        queueMicrotask(() =>
          suspense(anchor, () => source, {
            fallback: () => document.createElement(fallbackTag),
            default: () => document.createElement(resolvedTag)
          })
        );
        return anchor;
      }
    });

    const parent = document.createElement(parentTag);
    document.body.appendChild(parent);
    await tick();
    await tick();

    const pendingMounts = mountEvents(events);
    const parentMount = pendingMounts.find((event) => event.component.tag === parentTag);
    const fallbackMount = pendingMounts.find((event) => event.component.tag === fallbackTag);
    expect(fallbackMount?.component.parentId).toBe(parentMount?.component.id);

    resolveSource();
    await source;
    await tick();
    const resolvedMount = mountEvents(events).find((event) => event.component.tag === resolvedTag);
    expect(resolvedMount?.component.parentId).toBe(parentMount?.component.id);
    expect(
      events.some(
        (event) =>
          event.type === "component:unmount" && event.host === fallbackMount?.component.host
      )
    ).toBe(true);

    parent.remove();
    await tick();
    expect(
      events.some(
        (event) =>
          event.type === "component:unmount" && event.host === resolvedMount?.component.host
      )
    ).toBe(true);
  });
});
