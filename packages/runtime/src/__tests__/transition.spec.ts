// D2 Transition 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { useRef } from "@elfui/reactivity";

import { mark } from "../control-flow";
import { transition } from "../transition";

const frame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("D2 Transition", () => {
  it("首次挂载默认不走动画（无 appear）", () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    transition(anchor, () => {
      const el = document.createElement("p");
      el.textContent = "x";
      return el;
    });

    expect(host.querySelector("p")?.textContent).toBe("x");
    expect(host.querySelector("p")?.classList.length).toBe(0);
  });

  it("appear=true 首次也添加 enter class", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    transition(
      anchor,
      () => {
        const el = document.createElement("p");
        el.textContent = "x";
        return el;
      },
      { name: "fade", appear: true }
    );

    const p = host.querySelector("p") as HTMLElement;
    // 首次 useEffect 执行后挂载并加上 enter-from + enter-active
    expect(p.classList.contains("fade-enter-from")).toBe(true);
    expect(p.classList.contains("fade-enter-active")).toBe(true);

    await frame();
    // 下一帧切到 enter-to
    expect(p.classList.contains("fade-enter-from")).toBe(false);
    expect(p.classList.contains("fade-enter-to")).toBe(true);
  });

  it("v-if 切换：null -> el 走 enter", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    const show = useRef(false);
    transition(
      anchor,
      () => {
        if (!show.value) return null;
        const el = document.createElement("p");
        el.textContent = "y";
        return el;
      },
      { name: "fade" }
    );

    expect(host.querySelector("p")).toBeNull();
    show.value = true;
    const p = host.querySelector("p") as HTMLElement;
    expect(p).toBeTruthy();
    expect(p.classList.contains("fade-enter-from")).toBe(true);
  });

  it("JS hooks — onBeforeEnter / onEnter / onAfterEnter", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    const onBefore = vi.fn();
    const onEnter = vi.fn((_: Element, done: () => void) => done());
    const onAfter = vi.fn();

    const show = useRef(false);
    transition(
      anchor,
      () => {
        if (!show.value) return null;
        return document.createElement("p");
      },
      {
        css: false,
        onBeforeEnter: onBefore,
        onEnter,
        onAfterEnter: onAfter
      }
    );

    show.value = true;
    expect(onBefore).toHaveBeenCalledTimes(1);
    await frame();
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onAfter).toHaveBeenCalledTimes(1);
  });

  it("css: false 时不添加 class", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    transition(
      anchor,
      () => {
        const el = document.createElement("p");
        return el;
      },
      { name: "fade", appear: true, css: false }
    );

    const p = host.querySelector("p") as HTMLElement;
    expect(p.classList.length).toBe(0);
  });
});
