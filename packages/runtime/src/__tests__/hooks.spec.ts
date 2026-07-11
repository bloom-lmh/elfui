// 全局 setup helpers 单测

import { useEffect, useRef } from "@elfui/reactivity";
import {
  defineComponent,
  defineExpose,
  useAttrs,
  useClickOutside,
  useEventListener,
  useHost,
  useHostAttr,
  useHostClass,
  useHostCssVar,
  useHostFlag,
  useHostStyle,
  useRenderRoot,
  useShadowRoot,
  type DefineComponentOptions,
  type RenderFn,
  type SetupFn
} from "@elfui/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

let counter = 0;
const next = (): string => `elf-hooks-${++counter}`;

interface TestComponentBuilder {
  name(tag: string): TestComponentBuilder;
  setup(fn: SetupFn): TestComponentBuilder;
  render(fn: RenderFn): TestComponentBuilder;
  shadow(mode: "open" | "closed" | false): TestComponentBuilder;
  register(): CustomElementConstructor;
}

const createComponent = (): TestComponentBuilder => {
  const options: DefineComponentOptions = {};
  const builder: TestComponentBuilder = {
    name(tag) {
      options.name = tag;
      return builder;
    },
    setup(fn) {
      options.setup = fn as NonNullable<DefineComponentOptions["setup"]>;
      return builder;
    },
    render(fn) {
      options.render = fn;
      return builder;
    },
    shadow(mode) {
      options.shadow = mode;
      return builder;
    },
    register() {
      return defineComponent(options);
    }
  };
  return builder;
};

describe("useHost / useShadowRoot", () => {
  it("setup 外调用 useHost 会抛出清晰错误", () => {
    expect(() => useHost()).toThrow("[useHost]");
  });

  it("setup 内 useHost 返回 host element", async () => {
    const tag = next();
    let captured: HTMLElement | null = null;
    let captured2: ShadowRoot | null = null;
    createComponent()
      .name(tag)
      .setup(() => {
        captured = useHost();
        captured2 = useShadowRoot();
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();

    expect(captured).toBe(el);
    expect(captured2).toBe(el.shadowRoot);
  });

  it("useRenderRoot 返回实际渲染根", async () => {
    const shadowTag = next();
    const lightTag = next();
    let shadowRoot: HTMLElement | ShadowRoot | null = null;
    let lightRoot: HTMLElement | ShadowRoot | null = null;

    createComponent()
      .name(shadowTag)
      .setup(() => {
        shadowRoot = useRenderRoot();
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    createComponent()
      .name(lightTag)
      .shadow(false)
      .setup(() => {
        lightRoot = useRenderRoot();
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const shadowEl = document.createElement(shadowTag);
    const lightEl = document.createElement(lightTag);
    document.body.append(shadowEl, lightEl);
    await tick();

    expect(shadowRoot).toBe(shadowEl.shadowRoot);
    expect(lightRoot).toBe(lightEl);
  });
});

describe("useHostAttr / useHostFlag / useHostCssVar / useHostClass", () => {
  it("useHostAttr 把响应式同步到 host attribute", async () => {
    const tag = next();
    let setSize: ((v: string) => void) | null = null;
    createComponent()
      .name(tag)
      .setup(() => {
        const size = useRef("md");
        useHostAttr("data-size", () => size.value);
        setSize = (v) => size.set(v);
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    await tick();
    expect(el.getAttribute("data-size")).toBe("md");

    setSize!("lg");
    await tick();
    expect(el.getAttribute("data-size")).toBe("lg");
  });

  it("useHostFlag bool 反射", async () => {
    const tag = next();
    let setOpen: ((v: boolean) => void) | null = null;
    createComponent()
      .name(tag)
      .setup(() => {
        const open = useRef(false);
        useHostFlag("data-open", () => open.value);
        setOpen = (v) => open.set(v);
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    await tick();
    expect(el.hasAttribute("data-open")).toBe(false);

    setOpen!(true);
    await tick();
    expect(el.hasAttribute("data-open")).toBe(true);

    setOpen!(false);
    await tick();
    expect(el.hasAttribute("data-open")).toBe(false);
  });

  it("useHostCssVar 写入 CSS 自定义属性", async () => {
    const tag = next();
    createComponent()
      .name(tag)
      .setup(() => {
        useHostCssVar("--cols", () => 12);
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    await tick();
    expect(el.style.getPropertyValue("--cols")).toBe("12");
  });

  it("useHostClass 同步 classList", async () => {
    const tag = next();
    let toggle: (() => void) | null = null;
    createComponent()
      .name(tag)
      .setup(() => {
        const active = useRef(false);
        useHostClass(() => ({ active: active.value, base: true }));
        toggle = () => active.set(!active.value);
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    await tick();
    expect(el.classList.contains("base")).toBe(true);
    expect(el.classList.contains("active")).toBe(false);

    toggle!();
    await tick();
    expect(el.classList.contains("active")).toBe(true);

    toggle!();
    await tick();
    expect(el.classList.contains("active")).toBe(false);
  });

  it("useHostStyle 写 style 属性", async () => {
    const tag = next();
    createComponent()
      .name(tag)
      .setup(() => {
        useHostStyle("color", () => "red");
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();
    await tick();
    expect(el.style.color).toBe("red");
  });
});

describe("useEventListener", () => {
  it("自动 mount 注册、unmount 解绑", async () => {
    const tag = next();
    let count = 0;
    createComponent()
      .name(tag)
      .setup(() => {
        useEventListener(document, "custom-evt", () => {
          count++;
        });
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();

    document.dispatchEvent(new CustomEvent("custom-evt"));
    expect(count).toBe(1);

    document.body.removeChild(el);
    // 等微任务让 disconnectedCallback 真正执行 unmount
    await tick();
    await tick();

    document.dispatchEvent(new CustomEvent("custom-evt"));
    expect(count).toBe(1); // 没新增
  });
});

describe("useClickOutside", () => {
  it("点 host 内部不触发，点外部触发", async () => {
    const tag = next();
    let outside = 0;
    createComponent()
      .name(tag)
      .setup(() => {
        useClickOutside(useHost(), () => {
          outside++;
        });
        return {};
      })
      .render(() => {
        const div = document.createElement("div");
        div.id = "inner";
        return div;
      })
      .register();

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await tick();

    // 点 host 自身：不触发（点 host 也算 inside）
    el.click();
    expect(outside).toBe(0);

    // 点外部 body：触发
    document.body.click();
    expect(outside).toBe(1);
  });
});

describe("useAttrs", () => {
  it("响应式读取并跟踪 host attribute 变化", async () => {
    const tag = next();
    let attrs: Readonly<Record<string, string>> | null = null;
    let observed = "";
    createComponent()
      .name(tag)
      .setup(() => {
        attrs = useAttrs();
        useEffect(() => {
          observed = attrs!["data-foo"] ?? "missing";
        });
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag);
    el.setAttribute("data-foo", "bar");
    document.body.appendChild(el);
    await tick();

    expect(attrs!["data-foo"]).toBe("bar");
    expect(observed).toBe("bar");

    el.setAttribute("data-foo", "next");
    await tick();
    expect(attrs!["data-foo"]).toBe("next");
    expect(observed).toBe("next");

    el.removeAttribute("data-foo");
    await tick();
    expect(attrs!["data-foo"]).toBeUndefined();
    expect(observed).toBe("missing");
  });
});

describe("defineExpose", () => {
  it("把 setup 内方法暴露给 host 公共 API", async () => {
    const tag = next();
    const captured: number[] = [];
    createComponent()
      .name(tag)
      .setup(() => {
        defineExpose({
          ping: (n: number) => {
            captured.push(n);
            return n * 2;
          }
        });
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    const el = document.createElement(tag) as HTMLElement & { ping?: (n: number) => number };
    document.body.appendChild(el);
    await tick();

    const result = el.ping!(5);
    expect(captured).toEqual([5]);
    expect(result).toBe(10);
  });

  it("覆盖 host 已有属性时在 DEV 提醒", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tag = next();
    createComponent()
      .name(tag)
      .setup(() => {
        defineExpose({ focus: () => undefined });
        return {};
      })
      .render(() => document.createElement("div"))
      .register();

    document.body.appendChild(document.createElement(tag));
    await tick();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[defineExpose]"));
    warn.mockRestore();
  });
});
