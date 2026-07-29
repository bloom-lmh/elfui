// D5 Suspense 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { effectScope, useEffect, useRef } from "@elfui/reactivity";

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

  it("default、fallback 和 error slot 保持响应式", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);
    const label = useRef("a");
    let reject!: (error: Error) => void;
    const source = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const sourceState = useRef<Promise<void> | null>(source);
    const reactiveNode = (tag: "p" | "span" | "div", prefix: string): Node => {
      const node = document.createElement(tag);
      useEffect(() => {
        node.textContent = `${prefix}:${label.value}`;
      });
      return node;
    };

    suspense(anchor, () => sourceState.value, {
      default: () => reactiveNode("p", "default"),
      fallback: () => reactiveNode("span", "fallback"),
      error: () => reactiveNode("div", "error")
    });
    label.value = "b";
    expect(host.querySelector("span")?.textContent).toBe("fallback:b");

    reject(new Error("boom"));
    await source.catch(() => undefined);
    await tick();
    label.value = "c";
    expect(host.querySelector("div")?.textContent).toBe("error:c");
    expect(host.querySelector("span")).toBeNull();
    sourceState.value = null;
    label.value = "d";
    expect(host.querySelector("p")?.textContent).toBe("default:d");
  });

  it("忽略旧 source 的迟到结果", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const source = useRef<Promise<void>>(first);
    suspense(anchor, () => source.value, {
      default: () => {
        const node = document.createElement("p");
        node.textContent = source.peek() === second ? "second" : "first";
        return node;
      },
      fallback: () => document.createElement("span")
    });

    source.value = second;
    resolveFirst();
    await first;
    await tick();
    expect(host.querySelector("p")).toBeNull();
    resolveSecond();
    await second;
    await tick();
    expect(host.querySelector("p")?.textContent).toBe("second");
  });

  it("支持多根 slot 并在 owner scope 停止时清理", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);
    const anchor = mark();
    host.appendChild(anchor);
    const scope = effectScope();
    scope.run(() => {
      suspense(anchor, () => null, {
        default: () => {
          const fragment = document.createDocumentFragment();
          fragment.append(document.createElement("i"), document.createElement("b"));
          return fragment;
        }
      });
    });
    await tick();
    expect(host.querySelectorAll("i, b")).toHaveLength(2);
    scope.stop();
    expect(host.querySelectorAll("i, b")).toHaveLength(0);
  });
});
