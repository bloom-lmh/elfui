// D5 Suspense 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { useRef } from "@elfui/reactivity";

import { mark } from "../control-flow";
import { suspense } from "../suspense";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("D5 Suspense", () => {
  it("source=null 直接显示 default", () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    suspense(anchor, () => null, {
      default: () => {
        const p = document.createElement("p");
        p.textContent = "ok";
        return p;
      }
    });
    expect(host.querySelector("p")?.textContent).toBe("ok");
  });

  it("Promise pending 显示 fallback，resolved 显示 default", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolveFn = r;
    });

    suspense(anchor, () => promise, {
      default: () => {
        const p = document.createElement("p");
        p.textContent = "done";
        return p;
      },
      fallback: () => {
        const p = document.createElement("span");
        p.textContent = "loading";
        return p;
      }
    });

    expect(host.querySelector("span")?.textContent).toBe("loading");
    expect(host.querySelector("p")).toBeNull();

    resolveFn();
    await promise;
    await tick();

    expect(host.querySelector("p")?.textContent).toBe("done");
    expect(host.querySelector("span")).toBeNull();
  });

  it("Promise reject 显示 error slot", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    let rejectFn: (e: Error) => void = () => {};
    const promise = new Promise<void>((_, r) => {
      rejectFn = r;
    });

    suspense(anchor, () => promise, {
      default: () => {
        const p = document.createElement("p");
        return p;
      },
      fallback: () => {
        const p = document.createElement("span");
        p.textContent = "loading";
        return p;
      },
      error: (err) => {
        const div = document.createElement("div");
        div.textContent = `err: ${(err as Error).message}`;
        return div;
      }
    });

    expect(host.querySelector("span")).toBeTruthy();
    rejectFn(new Error("boom"));
    await promise.catch(() => {});
    await tick();
    expect(host.querySelector("div")?.textContent).toBe("err: boom");
  });

  it("source 切换重新进入 pending", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);

    const sourceState = useRef<Promise<unknown> | null>(Promise.resolve());
    suspense(anchor, () => sourceState.value, {
      default: () => {
        const p = document.createElement("p");
        p.textContent = "ok";
        return p;
      },
      fallback: () => {
        const s = document.createElement("span");
        s.textContent = "loading";
        return s;
      }
    });

    await tick();
    await tick();
    expect(host.querySelector("p")?.textContent).toBe("ok");

    // 切换到一个新 pending Promise
    let resolveFn: () => void = () => {};
    sourceState.value = new Promise<void>((r) => {
      resolveFn = r;
    });
    expect(host.querySelector("span")?.textContent).toBe("loading");
    resolveFn();
    await sourceState.peek();
    await tick();
    expect(host.querySelector("p")?.textContent).toBe("ok");
  });
});
