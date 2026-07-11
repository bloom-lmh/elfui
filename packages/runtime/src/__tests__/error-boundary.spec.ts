// L3.6 errorBoundary 单测

import { afterEach, describe, expect, it, vi } from "vitest";

import { errorBoundary } from "../error-boundary";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("errorBoundary", () => {
  const setup = () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const anchor = document.createComment("eb");
    root.appendChild(anchor);
    return { root, anchor };
  };

  it("default 渲染正常时不显示 fallback", () => {
    const { root, anchor } = setup();
    errorBoundary(anchor, {
      default: () => {
        const el = document.createElement("p");
        el.textContent = "ok";
        return el;
      },
      fallback: () => {
        const el = document.createElement("span");
        el.textContent = "boom";
        return el;
      }
    });
    expect(root.querySelector("p")?.textContent).toBe("ok");
    expect(root.querySelector("span")).toBeNull();
  });

  it("default 抛错切到 fallback 并传入 err", () => {
    const { root, anchor } = setup();
    const err = new Error("oops");
    errorBoundary(anchor, {
      default: () => {
        throw err;
      },
      fallback: (e) => {
        const el = document.createElement("span");
        el.textContent = (e as Error).message;
        return el;
      }
    });
    expect(root.querySelector("span")?.textContent).toBe("oops");
  });

  it("retry 切回 default", () => {
    const { root, anchor } = setup();
    let throwOnce = true;
    let savedRetry: (() => void) | null = null;
    errorBoundary(anchor, {
      default: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error("first");
        }
        const el = document.createElement("p");
        el.textContent = "after retry";
        return el;
      },
      fallback: (_err, retry) => {
        savedRetry = retry;
        const el = document.createElement("span");
        el.textContent = "fb";
        return el;
      }
    });
    expect(root.querySelector("span")).not.toBeNull();
    savedRetry!();
    expect(root.querySelector("p")?.textContent).toBe("after retry");
    expect(root.querySelector("span")).toBeNull();
  });

  it("fallback 自身抛错不崩溃（DEV 守卫 console.error）", () => {
    const { anchor } = setup();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      errorBoundary(anchor, {
        default: () => {
          throw new Error("a");
        },
        fallback: () => {
          throw new Error("b");
        }
      });
    }).not.toThrow();
    errSpy.mockRestore();
  });
});
