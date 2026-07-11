// E2 provide/inject 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { defineCustomElement } from "../element";
import { createInjectionKey, hasInjectionContext, inject, provide } from "../inject";

let tagCounter = 0;
const nextTag = (): string => `elf-inject-${++tagCounter}`;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createInjectionKey", () => {
  it("返回 symbol", () => {
    const k = createInjectionKey("theme");
    expect(typeof k).toBe("symbol");
    expect((k as unknown as { description?: string }).description).toBe("theme");
  });
});

describe("provide / inject", () => {
  it("父组件 provide，子组件 inject", () => {
    const KEY = createInjectionKey<string>("theme");
    let captured: string | undefined = undefined;

    const childTag = nextTag();
    defineCustomElement({
      tag: childTag,
      setup: () => {
        captured = inject(KEY);
        return {};
      },
      render: () => document.createElement("div")
    });

    const parentTag = nextTag();
    defineCustomElement({
      tag: parentTag,
      setup: () => {
        provide(KEY, "dark");
        return {};
      },
      render: (ctx) => {
        const child = document.createElement(childTag);
        ctx.shadow?.appendChild(child);
        return document.createElement("section");
      }
    });

    const p = document.createElement(parentTag);
    document.body.appendChild(p);

    expect(captured).toBe("dark");
  });

  it("找不到 provider 返回默认值", () => {
    const KEY = createInjectionKey<string>("missing");
    let captured: string | undefined = undefined;

    const tag = nextTag();
    defineCustomElement({
      tag,
      setup: () => {
        captured = inject(KEY, "fallback");
        return {};
      },
      render: () => document.createElement("div")
    });

    const el = document.createElement(tag);
    document.body.appendChild(el);

    expect(captured).toBe("fallback");
  });

  it("跨 ShadowRoot 沿父链查找", () => {
    const KEY = createInjectionKey<number>("level");
    let captured: number | undefined = undefined;

    const innerTag = nextTag();
    defineCustomElement({
      tag: innerTag,
      setup: () => {
        captured = inject(KEY);
        return {};
      },
      render: () => document.createElement("p")
    });

    const middleTag = nextTag();
    defineCustomElement({
      tag: middleTag,
      render: (ctx) => {
        const inner = document.createElement(innerTag);
        ctx.shadow?.appendChild(inner);
        return document.createElement("section");
      }
    });

    const outerTag = nextTag();
    defineCustomElement({
      tag: outerTag,
      setup: () => {
        provide(KEY, 42);
        return {};
      },
      render: (ctx) => {
        const middle = document.createElement(middleTag);
        ctx.shadow?.appendChild(middle);
        return document.createElement("section");
      }
    });

    const root = document.createElement(outerTag);
    document.body.appendChild(root);

    expect(captured).toBe(42);
  });

  it("最近的 provider 优先（覆盖）", () => {
    const KEY = createInjectionKey<string>("x");
    let captured: string | undefined = undefined;

    const childTag = nextTag();
    defineCustomElement({
      tag: childTag,
      setup: () => {
        captured = inject(KEY);
        return {};
      },
      render: () => document.createElement("div")
    });

    const middleTag = nextTag();
    defineCustomElement({
      tag: middleTag,
      setup: () => {
        provide(KEY, "near");
        return {};
      },
      render: (ctx) => {
        const c = document.createElement(childTag);
        ctx.shadow?.appendChild(c);
        return document.createElement("section");
      }
    });

    const outerTag = nextTag();
    defineCustomElement({
      tag: outerTag,
      setup: () => {
        provide(KEY, "far");
        return {};
      },
      render: (ctx) => {
        const m = document.createElement(middleTag);
        ctx.shadow?.appendChild(m);
        return document.createElement("section");
      }
    });

    const root = document.createElement(outerTag);
    document.body.appendChild(root);

    expect(captured).toBe("near");
  });

  it("string key 也支持", () => {
    let captured: unknown = undefined;
    const child = nextTag();
    defineCustomElement({
      tag: child,
      setup: () => {
        captured = inject("foo");
        return {};
      },
      render: () => document.createElement("div")
    });
    const parent = nextTag();
    defineCustomElement({
      tag: parent,
      setup: () => {
        provide("foo", "bar");
        return {};
      },
      render: (ctx) => {
        ctx.shadow?.appendChild(document.createElement(child));
        return document.createElement("section");
      }
    });
    const el = document.createElement(parent);
    document.body.appendChild(el);
    expect(captured).toBe("bar");
  });
});

describe("hasInjectionContext", () => {
  it("setup 内为 true", () => {
    let inSetup = false;
    const tag = nextTag();
    defineCustomElement({
      tag,
      setup: () => {
        inSetup = hasInjectionContext();
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(inSetup).toBe(true);
  });

  it("setup 外为 false", () => {
    expect(hasInjectionContext()).toBe(false);
  });
});

describe("边界", () => {
  it("setup 外调用 provide 打 warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    provide("x", 1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("setup 外调用 inject 打 warn 并返回默认值", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(inject("x", "default")).toBe("default");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
