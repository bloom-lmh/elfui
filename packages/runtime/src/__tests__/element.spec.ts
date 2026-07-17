// C3 + C4 Custom Element 包壳 + 生命周期 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { useEffect, useRef } from "@elfui/reactivity";

import { defineCustomElement, ensureCustomElement } from "../element";
import {
  onAttributeChanged,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onErrorCaptured,
  onMount,
  onMounted,
  onUnmount,
  onUnmounted,
  onUpdated
} from "../lifecycle";
import { text } from "../bindings";
import { branch, list, mark } from "../control-flow";
import { setTemplateRef, useTemplateRef } from "../template-ref";

let tagCounter = 0;
const nextTag = (): string => `elf-test-${++tagCounter}`;

const flushDisconnect = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("defineCustomElement 基础", () => {
  it("服务端定义返回可安全导入的占位构造器，并在误注册时给出明确诊断", () => {
    const tag = nextTag();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: undefined });

    try {
      const component = defineCustomElement({ tag });

      expect(component.__elfDefinition.tag).toBe(tag);
      expect(customElements.get(tag)).toBeUndefined();
      expect(() => ensureCustomElement(component)).toThrowError(/\[ELF_SSR_PLACEHOLDER\]/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "HTMLElement", descriptor);
    }
  });

  it("缺少 Custom Elements registry 时显式注册会给出 client-only 诊断", () => {
    const component = defineCustomElement({ tag: nextTag() }, { register: false });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "customElements");
    Object.defineProperty(globalThis, "customElements", { configurable: true, value: undefined });

    try {
      expect(() => ensureCustomElement(component)).toThrowError(
        /\[ELF_CUSTOM_ELEMENTS_UNAVAILABLE\]/
      );
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "customElements", descriptor);
    }
  });

  it("同名标签遇到不同构造器时拒绝静默复用", () => {
    const tag = nextTag();
    const first = defineCustomElement({ tag }, { register: false });
    const second = defineCustomElement({ tag }, { register: false });

    expect(ensureCustomElement(first)).toBe(tag);
    expect(ensureCustomElement(first)).toBe(tag);
    expect(() => ensureCustomElement(second)).toThrowError(/\[ELF_CUSTOM_ELEMENT_CONFLICT\]/);
    expect(customElements.get(tag)).toBe(first);
  });

  it("注册并实例化", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      render: (ctx) => {
        const el = document.createElement("p");
        el.textContent = "hello";
        ctx.shadow?.appendChild(el);
        return document.createElement("span"); // 占位
      }
    });
    const instance = document.createElement(tag);
    document.body.appendChild(instance);
    expect(instance.shadowRoot).toBeTruthy();
    document.body.removeChild(instance);
  });

  it("setup 返回值进入 render context.state", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      setup: () => {
        return { msg: "hi" };
      },
      render: (ctx) => {
        const p = document.createElement("p");
        p.textContent = String(ctx.state.msg);
        return p;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelector("p")?.textContent).toBe("hi");
    document.body.removeChild(el);
  });

  it("Shadow DOM 默认 open", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeTruthy();
    document.body.removeChild(el);
  });

  it("shadow: false 不创建 shadow，挂到 host 自身", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      shadow: false,
      render: () => {
        const p = document.createElement("p");
        p.textContent = "no-shadow";
        return p;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeNull();
    expect(el.querySelector("p")?.textContent).toBe("no-shadow");
    document.body.removeChild(el);
  });

  it("样式注入 — fallback <style> 形式", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      styles: ["p { color: red; }"],
      render: () => document.createElement("p")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const styleEl = el.shadowRoot?.querySelector("style");
    // jsdom 不支持 adoptedStyleSheets，会走 <style> fallback
    if (styleEl) {
      expect(styleEl.textContent).toContain("color: red");
    }
    document.body.removeChild(el);
  });

  it("相同 CSS 在多个实例间复用 Constructable Stylesheet", () => {
    const styleSheetDescriptor = Object.getOwnPropertyDescriptor(window, "CSSStyleSheet");
    const adoptedDescriptor = Object.getOwnPropertyDescriptor(
      ShadowRoot.prototype,
      "adoptedStyleSheets"
    );
    const adopted = new WeakMap<ShadowRoot, CSSStyleSheet[]>();
    let constructed = 0;
    const replaceSync = vi.fn();
    class FakeStyleSheet {
      public constructor() {
        constructed++;
      }

      public replaceSync(css: string): void {
        replaceSync(css);
      }
    }

    Object.defineProperty(window, "CSSStyleSheet", {
      configurable: true,
      value: FakeStyleSheet
    });
    Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
      configurable: true,
      get(this: ShadowRoot): CSSStyleSheet[] {
        return adopted.get(this) ?? [];
      },
      set(this: ShadowRoot, value: CSSStyleSheet[]) {
        adopted.set(this, Array.from(value));
      }
    });

    try {
      const tag = nextTag();
      defineCustomElement({
        tag,
        styles: ["p { color: shared; }"],
        render: () => document.createElement("p")
      });
      const first = document.createElement(tag);
      const second = document.createElement(tag);
      document.body.append(first, second);

      const firstSheet = first.shadowRoot?.adoptedStyleSheets[0];
      const secondSheet = second.shadowRoot?.adoptedStyleSheets[0];
      expect(constructed).toBe(1);
      expect(replaceSync).toHaveBeenCalledOnce();
      expect(firstSheet).toBe(secondSheet);
      expect(first.shadowRoot?.querySelector("style")).toBeNull();
      expect(second.shadowRoot?.querySelector("style")).toBeNull();
    } finally {
      if (styleSheetDescriptor) {
        Object.defineProperty(window, "CSSStyleSheet", styleSheetDescriptor);
      } else {
        Reflect.deleteProperty(window, "CSSStyleSheet");
      }
      if (adoptedDescriptor) {
        Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", adoptedDescriptor);
      } else {
        Reflect.deleteProperty(ShadowRoot.prototype, "adoptedStyleSheets");
      }
    }
  });
});

describe("Props", () => {
  it("attribute 同步到 prop", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { name: { type: String, default: "default" } },
      render: (ctx) => {
        const p = document.createElement("p");
        p.textContent = String(ctx.props.name);
        return p;
      }
    });
    const el = document.createElement(tag);
    el.setAttribute("name", "alice");
    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelector("p")?.textContent).toBe("alice");
    document.body.removeChild(el);
  });

  it("Number 类型转换", () => {
    const tag = nextTag();
    let captured: unknown = null;
    defineCustomElement({
      tag,
      props: { count: { type: Number, default: 0 } },
      setup: (props) => {
        captured = props.count;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    el.setAttribute("count", "42");
    document.body.appendChild(el);
    expect(captured).toBe(42);
    document.body.removeChild(el);
  });

  it("Boolean 类型转换", () => {
    const tag = nextTag();
    let captured: unknown = null;
    defineCustomElement({
      tag,
      props: { active: { type: Boolean, default: false } },
      setup: (props) => {
        captured = props.active;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    el.setAttribute("active", "");
    document.body.appendChild(el);
    expect(captured).toBe(true);
    document.body.removeChild(el);
  });

  it("Boolean attribute 始终转换为明确的 boolean", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { active: { type: Boolean, default: false } },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag) as HTMLElement & { active: boolean };
    document.body.appendChild(el);

    expect(el.active).toBe(false);
    el.setAttribute("active", "");
    expect(el.active).toBe(true);
    el.setAttribute("active", "true");
    expect(el.active).toBe(true);
    el.setAttribute("active", "active");
    expect(el.active).toBe(true);
    el.setAttribute("active", "false");
    expect(el.active).toBe(false);
    el.setAttribute("active", "disabled");
    expect(el.active).toBe(false);
    el.removeAttribute("active");
    expect(el.active).toBe(false);
  });

  it("attribute 变化触发响应（attributeChangedCallback 链路）", async () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { value: { type: String, default: "x" } },
      render: (_ctx) => {
        const span = document.createElement("span");
        // 通过 useEffect 在 ctx 内部不太方便，直接用 ctx.props 访问
        // 这里测试 attribute 变化的链路：检查 host[propKey]
        span.id = "out";
        return span;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    el.setAttribute("value", "y");
    expect((el as unknown as { value: string }).value).toBe("y");
    document.body.removeChild(el);
  });

  it("ctx.state 实时读取 props，attribute 更新会刷新模板 binding", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { value: { type: String, default: "x" } },
      render: (ctx) => {
        const output = document.createTextNode("");
        text(output, () => ctx.state.value);
        return output;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);

    expect(el.shadowRoot?.textContent).toBe("x");
    el.setAttribute("value", "y");
    expect(el.shadowRoot?.textContent).toBe("y");
  });

  it("attribute map 保留无法由 camelCase 反推的 prop key", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { data_value: { type: String, default: "initial" } },
      render: (ctx) => {
        const output = document.createTextNode("");
        text(output, () => ctx.state.data_value);
        return output;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);

    el.setAttribute("data-value", "updated");

    expect(el.shadowRoot?.textContent).toBe("updated");
    expect((el as unknown as Record<string, unknown>).data_value).toBe("updated");
  });

  it("host[prop] 暴露 getter/setter", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      props: { count: { type: Number, default: 0 } },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag) as HTMLElement & { count: number };
    document.body.appendChild(el);
    expect(el.count).toBe(0);
    el.count = 5;
    expect(el.count).toBe(5);
    document.body.removeChild(el);
  });

  it("object/array props 保留宿主 property 的引用身份并在替换时更新", () => {
    const tag = nextTag();
    const initialObject = { mode: "initial" };
    const initialArray = [1, 2];
    defineCustomElement({
      tag,
      props: {
        config: { type: Object, default: () => ({}) },
        items: { type: Array, default: () => [] }
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag) as HTMLElement & {
      config: Record<string, unknown>;
      items: unknown[];
    };
    el.config = initialObject;
    el.items = initialArray;
    expect("config" in el).toBe(true);
    expect("items" in el).toBe(true);
    document.body.appendChild(el);

    expect(el.config).toBe(initialObject);
    expect(el.items).toBe(initialArray);

    const nextObject = { mode: "next" };
    const nextArray = [3, 4, 5];
    el.config = nextObject;
    el.items = nextArray;
    expect(el.config).toBe(nextObject);
    expect(el.items).toBe(nextArray);
    el.remove();
  });
});

describe("生命周期", () => {
  it("onMounted / onUnmounted 与旧命名共享同一时序", async () => {
    const tag = nextTag();
    const order: string[] = [];
    defineCustomElement({
      tag,
      setup: () => {
        onMount(() => order.push("mount"));
        onMounted(() => order.push("mounted"));
        onUnmount(() => order.push("unmount"));
        onUnmounted(() => order.push("unmounted"));
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);

    document.body.appendChild(el);
    expect(order).toEqual(["mount", "mounted"]);
    el.remove();
    await flushDisconnect();
    expect(order).toEqual(["mount", "mounted", "unmount", "unmounted"]);
  });

  it("同步组件在 DOM 和 template ref 就绪后才 mounted", () => {
    const tag = nextTag();
    const order: string[] = [];
    let inputRef!: ReturnType<typeof useTemplateRef<HTMLInputElement>>;
    defineCustomElement({
      tag,
      setup: () => {
        order.push("setup");
        inputRef = useTemplateRef<HTMLInputElement>("input");
        onBeforeMount(() => order.push("beforeMount"));
        onMounted(() => {
          expect(inputRef.value?.isConnected).toBe(true);
          order.push("mounted");
        });
        return {};
      },
      render: (ctx) => {
        order.push("render");
        const input = document.createElement("input");
        setTemplateRef(ctx.host, "input", input);
        expect(inputRef.value).toBe(input);
        order.push("ref");
        return input;
      }
    });

    document.body.appendChild(document.createElement(tag));

    expect(order).toEqual(["setup", "beforeMount", "render", "ref", "mounted"]);
  });

  it("async setup 完成最终 DOM 和 template ref 后才 mounted", async () => {
    const tag = nextTag();
    const order: string[] = [];
    const count = useRef(0);
    let inputRef!: ReturnType<typeof useTemplateRef<HTMLInputElement>>;
    let resolveSetup!: (state: Record<string, unknown>) => void;
    const setupResult = new Promise<Record<string, unknown>>((resolve) => {
      resolveSetup = resolve;
    });
    defineCustomElement({
      tag,
      setup: () => {
        order.push("setup");
        inputRef = useTemplateRef<HTMLInputElement>("input");
        onBeforeMount(() => order.push("beforeMount"));
        onMounted(() => {
          expect(inputRef.value?.isConnected).toBe(true);
          order.push("mounted");
        });
        return setupResult;
      },
      render: (ctx) => {
        if (ctx.state.$asyncPending) {
          const pending = document.createElement("input");
          pending.dataset.pending = "";
          setTemplateRef(ctx.host, "input", pending);
          return pending;
        }
        order.push("render");
        const root = document.createElement("div");
        const input = root.appendChild(document.createElement("input"));
        setTemplateRef(ctx.host, "input", input);
        expect(inputRef.value).toBe(input);
        order.push("ref");
        const output = root.appendChild(document.createElement("output"));
        text(output.appendChild(document.createTextNode("")), () => ctx.state.count);
        return root;
      }
    });
    const el = document.createElement(tag);

    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelector("[data-pending]")).not.toBeNull();
    const pendingInput = inputRef.value;
    expect(order).toEqual(["setup"]);

    resolveSetup({ count });
    await Promise.resolve();

    expect(order).toEqual(["setup", "beforeMount", "render", "ref", "mounted"]);
    expect(el.shadowRoot?.querySelector("[data-pending]")).toBeNull();
    expect(pendingInput?.isConnected).toBe(false);
    expect(inputRef.value).not.toBe(pendingInput);
    expect(el.shadowRoot?.querySelector("output")?.textContent).toBe("0");
    count.value = 1;
    expect(el.shadowRoot?.querySelector("output")?.textContent).toBe("1");

    const output = el.shadowRoot?.querySelector("output");
    el.remove();
    await flushDisconnect();
    count.value = 2;
    expect(output?.textContent).toBe("1");
  });

  it("setup 或 render 失败不会报告 mounted", () => {
    const setupTag = nextTag();
    const renderTag = nextTag();
    const setupMounted = vi.fn();
    const renderMounted = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineCustomElement({
      tag: setupTag,
      setup: () => {
        onMounted(setupMounted);
        throw new Error("setup failed");
      }
    });
    defineCustomElement({
      tag: renderTag,
      setup: () => {
        onMounted(renderMounted);
        return {};
      },
      render: () => {
        throw new Error("render failed");
      }
    });

    document.body.append(document.createElement(setupTag), document.createElement(renderTag));

    expect(setupMounted).not.toHaveBeenCalled();
    expect(renderMounted).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("生命周期钩子错误进入 onErrorCaptured", () => {
    const tag = nextTag();
    const error = new Error("mounted hook failed");
    const captured = vi.fn(() => false as const);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineCustomElement({
      tag,
      setup: () => {
        onErrorCaptured(captured);
        onMounted(() => {
          throw error;
        });
        return {};
      },
      render: () => document.createElement("div")
    });

    document.body.appendChild(document.createElement(tag));

    expect(captured).toHaveBeenCalledWith(error, expect.anything());
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("异步生命周期钩子的 rejection 进入 onErrorCaptured", async () => {
    const tag = nextTag();
    const error = new Error("async mounted hook failed");
    const captured = vi.fn(() => false as const);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineCustomElement({
      tag,
      setup: () => {
        onErrorCaptured(captured);
        onMounted(async () => {
          await Promise.resolve();
          throw error;
        });
        return {};
      },
      render: () => document.createElement("div")
    });

    document.body.appendChild(document.createElement(tag));
    expect(captured).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();

    expect(captured).toHaveBeenCalledWith(error, expect.anything());
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("template ref 在分支替换时按元素身份更新和置空", () => {
    const tag = nextTag();
    const visible = useRef(true);
    let buttonRef!: ReturnType<typeof useTemplateRef<HTMLButtonElement>>;
    defineCustomElement({
      tag,
      setup: () => {
        buttonRef = useTemplateRef<HTMLButtonElement>("action");
        return { visible };
      },
      render: (ctx) => {
        const root = document.createElement("div");
        const anchor = root.appendChild(mark("branch-ref"));
        branch(anchor, () => (visible.value ? 0 : -1), [
          () => {
            const button = document.createElement("button");
            setTemplateRef(ctx.host, "action", button);
            return button;
          }
        ]);
        return root;
      }
    });
    document.body.appendChild(document.createElement(tag));
    const first = buttonRef.value;

    expect(first?.isConnected).toBe(true);
    visible.value = false;
    expect(buttonRef.value).toBeNull();
    expect(first?.isConnected).toBe(false);

    visible.value = true;
    expect(buttonRef.value).not.toBe(first);
    expect(buttonRef.value?.isConnected).toBe(true);
  });

  it("同名列表 ref 删除当前元素时回退到仍存活的元素", () => {
    const tag = nextTag();
    const items = useRef([1, 2, 3]);
    let rowRef!: ReturnType<typeof useTemplateRef<HTMLLIElement>>;
    defineCustomElement({
      tag,
      setup: () => {
        rowRef = useTemplateRef<HTMLLIElement>("row");
        return { items };
      },
      render: (ctx) => {
        const root = document.createElement("ul");
        const anchor = root.appendChild(mark("list-ref"));
        list(
          anchor,
          () => items.value,
          (item) => item,
          (item) => {
            const row = document.createElement("li");
            row.textContent = String(item.value);
            setTemplateRef(ctx.host, "row", row);
            return row;
          }
        );
        return root;
      }
    });
    document.body.appendChild(document.createElement(tag));

    expect(rowRef.value?.textContent).toBe("3");
    items.value = [1, 2];
    expect(rowRef.value?.textContent).toBe("2");
    expect(rowRef.value?.isConnected).toBe(true);
    items.value = [];
    expect(rowRef.value).toBeNull();
  });

  it("完整卸载清空旧 template ref，重连创建独立的新 ref", async () => {
    const tag = nextTag();
    const refs: Array<ReturnType<typeof useTemplateRef<HTMLInputElement>>> = [];
    defineCustomElement({
      tag,
      setup: () => {
        const inputRef = useTemplateRef<HTMLInputElement>("input");
        refs.push(inputRef);
        return {};
      },
      render: (ctx) => {
        const input = document.createElement("input");
        setTemplateRef(ctx.host, "input", input);
        return input;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const firstElement = refs[0]?.value;

    el.remove();
    await flushDisconnect();
    expect(refs[0]?.value).toBeNull();
    expect(firstElement?.isConnected).toBe(false);

    document.body.appendChild(el);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.value).toBeNull();
    expect(refs[1]?.value).not.toBe(firstElement);
    expect(refs[1]?.value?.isConnected).toBe(true);
  });

  it("onMount 在挂载后调用", () => {
    const tag = nextTag();
    const spy = vi.fn();
    defineCustomElement({
      tag,
      setup: () => {
        onMount(spy);
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(spy).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });

  it("onBeforeMount 在 render 之前、onMount 之后挂载之前调用", () => {
    const tag = nextTag();
    const order: string[] = [];
    defineCustomElement({
      tag,
      setup: () => {
        onBeforeMount(() => order.push("beforeMount"));
        onMount(() => order.push("mount"));
        return {};
      },
      render: () => {
        order.push("render");
        return document.createElement("div");
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(order).toEqual(["beforeMount", "render", "mount"]);
    document.body.removeChild(el);
  });

  it("onUnmount 在断开后调用（异步）", async () => {
    const tag = nextTag();
    const spy = vi.fn();
    defineCustomElement({
      tag,
      setup: () => {
        onUnmount(spy);
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    document.body.removeChild(el);
    await flushDisconnect();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("onBeforeUnmount 在 onUnmount 之前", async () => {
    const tag = nextTag();
    const order: string[] = [];
    defineCustomElement({
      tag,
      setup: () => {
        onBeforeUnmount(() => order.push("before"));
        onUnmount(() => order.push("after"));
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    document.body.removeChild(el);
    await flushDisconnect();
    expect(order).toEqual(["before", "after"]);
  });

  it("断开后立即重连不触发 unmount（DOM move）", async () => {
    const tag = nextTag();
    const unmount = vi.fn();
    defineCustomElement({
      tag,
      setup: () => {
        onUnmount(unmount);
        return {};
      },
      render: () => document.createElement("div")
    });
    const a = document.createElement("section");
    const b = document.createElement("section");
    document.body.appendChild(a);
    document.body.appendChild(b);
    const el = document.createElement(tag);
    a.appendChild(el);
    // 移动到 b
    b.appendChild(el);
    await flushDisconnect();
    expect(unmount).toHaveBeenCalledTimes(0);
    document.body.removeChild(a);
    document.body.removeChild(b);
  });

  it("DOM move、完整断开和重连具有精确的初始化与清理次数", async () => {
    const tag = nextTag();
    const counts = {
      setup: 0,
      mounted: 0,
      beforeUnmount: 0,
      unmounted: 0,
      resources: 0,
      cleanups: 0
    };
    defineCustomElement({
      tag,
      setup: () => {
        counts.setup++;
        useEffect(() => {
          counts.resources++;
          return () => {
            counts.resources--;
            counts.cleanups++;
          };
        });
        onMounted(() => counts.mounted++);
        onBeforeUnmount(() => counts.beforeUnmount++);
        onUnmounted(() => counts.unmounted++);
        return {};
      },
      render: () => document.createElement("div")
    });

    const a = document.createElement("section");
    const b = document.createElement("section");
    document.body.append(a, b);
    const el = document.createElement(tag);

    a.appendChild(el);
    expect(counts).toEqual({
      setup: 1,
      mounted: 1,
      beforeUnmount: 0,
      unmounted: 0,
      resources: 1,
      cleanups: 0
    });

    b.appendChild(el);
    await flushDisconnect();
    expect(counts.setup).toBe(1);
    expect(counts.mounted).toBe(1);
    expect(counts.resources).toBe(1);
    expect(counts.cleanups).toBe(0);

    el.remove();
    await flushDisconnect();
    expect(counts.beforeUnmount).toBe(1);
    expect(counts.unmounted).toBe(1);
    expect(counts.resources).toBe(0);
    expect(counts.cleanups).toBe(1);

    b.appendChild(el);
    expect(counts.setup).toBe(2);
    expect(counts.mounted).toBe(2);
    expect(counts.resources).toBe(1);

    el.remove();
    await flushDisconnect();
    expect(counts.beforeUnmount).toBe(2);
    expect(counts.unmounted).toBe(2);
    expect(counts.resources).toBe(0);
    expect(counts.cleanups).toBe(2);
  });

  it("100 次独立挂载/卸载后不保留组件 effect 资源", async () => {
    const tag = nextTag();
    let mounted = 0;
    let unmounted = 0;
    let resources = 0;
    defineCustomElement({
      tag,
      setup: () => {
        useEffect(() => {
          resources++;
          return () => resources--;
        });
        onMounted(() => mounted++);
        onUnmounted(() => unmounted++);
        return {};
      },
      render: () => document.createElement("div")
    });

    for (let i = 0; i < 100; i++) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      el.remove();
    }
    await flushDisconnect();

    expect(mounted).toBe(100);
    expect(unmounted).toBe(100);
    expect(resources).toBe(0);
  });

  it("完整卸载后重连只保留一棵渲染树和一份样式", async () => {
    const tag = nextTag();
    const setup = vi.fn(() => ({}));
    defineCustomElement({
      tag,
      setup,
      styles: [":host { display: block; }"],
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);

    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelectorAll("div")).toHaveLength(1);
    expect(el.shadowRoot?.querySelectorAll("style")).toHaveLength(1);

    el.remove();
    await flushDisconnect();
    expect(el.shadowRoot?.querySelectorAll("div")).toHaveLength(0);

    document.body.appendChild(el);
    expect(setup).toHaveBeenCalledTimes(2);
    expect(el.shadowRoot?.querySelectorAll("div")).toHaveLength(1);
    expect(el.shadowRoot?.querySelectorAll("style")).toHaveLength(1);
  });

  it("light DOM 组件卸载时只清理框架渲染节点", async () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      shadow: false,
      render: () => {
        const node = document.createElement("div");
        node.dataset.framework = "";
        return node;
      }
    });
    const el = document.createElement(tag);
    const userNode = document.createElement("span");
    userNode.dataset.user = "";
    el.appendChild(userNode);

    document.body.appendChild(el);
    expect(el.querySelectorAll("[data-framework]")).toHaveLength(1);
    el.remove();
    await flushDisconnect();

    expect(el.querySelector("[data-user]")).toBe(userNode);
    expect(el.querySelectorAll("[data-framework]")).toHaveLength(0);
    document.body.appendChild(el);
    expect(el.querySelectorAll("[data-framework]")).toHaveLength(1);
  });

  it("父组件可以捕获子组件 setup 错误", () => {
    const childTag = nextTag();
    const parentTag = nextTag();
    const captured = vi.fn((_err: unknown, _instance: unknown) => false as const);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineCustomElement({
      tag: childTag,
      setup: () => {
        throw new Error("child boom");
      },
      render: () => document.createElement("div")
    });
    defineCustomElement({
      tag: parentTag,
      setup: () => {
        onErrorCaptured(captured);
        return {};
      },
      render: () => document.createElement(childTag)
    });

    document.body.appendChild(document.createElement(parentTag));

    expect(captured).toHaveBeenCalledTimes(1);
    expect(captured.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: "child boom" }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("onAttributeChanged 钩子触发", () => {
    const tag = nextTag();
    const spy = vi.fn();
    defineCustomElement({
      tag,
      props: { value: { type: String, default: "" } },
      setup: () => {
        onAttributeChanged(spy);
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    el.setAttribute("value", "new");
    expect(spy).toHaveBeenCalled();
    document.body.removeChild(el);
  });

  it("onAttributeChanged 钩子错误进入组件错误链", () => {
    const tag = nextTag();
    const captured = vi.fn((_error: unknown) => false as const);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineCustomElement({
      tag,
      props: { value: { type: String, default: "" } },
      setup: () => {
        onErrorCaptured(captured);
        onAttributeChanged(() => {
          throw new Error("attribute hook boom");
        });
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);

    el.setAttribute("value", "new");

    expect(captured).toHaveBeenCalledWith(
      expect.objectContaining({ message: "attribute hook boom" }),
      expect.anything()
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("动态绑定更新时触发 onBeforeUpdate / onUpdated", async () => {
    const tag = nextTag();
    const order: string[] = [];
    let count: ReturnType<typeof useRef<number>> | null = null;
    defineCustomElement({
      tag,
      setup: () => {
        count = useRef(0);
        onBeforeUpdate(() => order.push("beforeUpdate"));
        onUpdated(() => order.push("updated"));
        return { count };
      },
      render: (ctx) => {
        const span = document.createElement("span");
        text(span.appendChild(document.createTextNode("")), () => ctx.state.count);
        return span;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(order).toEqual([]);

    count!.set(1);
    expect(order).toEqual(["beforeUpdate"]);
    await Promise.resolve();
    expect(order).toEqual(["beforeUpdate", "updated"]);
    expect(el.shadowRoot?.querySelector("span")?.textContent).toBe("1");
    document.body.removeChild(el);
  });
});

describe("响应式集成", () => {
  it("setup 内的 useRef 驱动 render context", () => {
    const tag = nextTag();
    let count: ReturnType<typeof useRef<number>> | null = null;
    defineCustomElement({
      tag,
      setup: () => {
        const c = useRef(0);
        count = c;
        return { count: c };
      },
      render: (ctx) => {
        const span = document.createElement("span");
        // 编译产物会用 text(span, () => ctx.state.count)
        // 这里我们手动模拟一个简单绑定
        span.textContent = String(ctx.state.count);
        return span;
      }
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const span = el.shadowRoot?.querySelector("span");
    expect(span?.textContent).toBe("0");
    // 这里只测初始；端到端响应式需要绑定原语，留给 B3 codegen 验证
    expect(count).toBeTruthy();
    document.body.removeChild(el);
  });
});

describe("emit", () => {
  it("setup ctx.emit 默认把单参数直接写入 CustomEvent.detail", () => {
    const tag = nextTag();
    let dispatched: boolean | undefined;
    defineCustomElement({
      tag,
      setup: (_, ctx) => {
        // 立即 emit 一个事件（仅测试 emit 链路）
        Promise.resolve().then(() => {
          dispatched = ctx.emit("custom-event", 42);
        });
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    const handler = vi.fn();
    el.addEventListener("custom-event", handler);
    document.body.appendChild(el);
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(handler).toHaveBeenCalledTimes(1);
        const evt = handler.mock.calls[0]?.[0] as CustomEvent;
        expect(evt.detail).toBe(42);
        expect(evt.bubbles).toBe(false);
        expect(evt.cancelable).toBe(false);
        expect(evt.composed).toBe(false);
        expect(dispatched).toBe(true);
        document.body.removeChild(el);
        resolve();
      });
    });
  });

  it("多参数事件仍以数组作为 detail", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      setup: (_, ctx) => {
        Promise.resolve().then(() => ctx.emit("custom-event", "old", "new"));
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    const handler = vi.fn();
    el.addEventListener("custom-event", handler);
    document.body.appendChild(el);
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(handler).toHaveBeenCalledTimes(1);
        const evt = handler.mock.calls[0]?.[0] as CustomEvent;
        expect(evt.detail).toEqual(["old", "new"]);
        document.body.removeChild(el);
        resolve();
      });
    });
  });

  it("emitOptions.rawDetail=false 时兼容旧数组包装", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      emitOptions: { rawDetail: false },
      setup: (_, ctx) => {
        Promise.resolve().then(() => ctx.emit("custom-event", 42));
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    const handler = vi.fn();
    el.addEventListener("custom-event", handler);
    document.body.appendChild(el);
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(handler).toHaveBeenCalledTimes(1);
        const evt = handler.mock.calls[0]?.[0] as CustomEvent;
        expect(evt.detail).toEqual([42]);
        document.body.removeChild(el);
        resolve();
      });
    });
  });

  it("emitOptions 可以配置事件传播并返回取消结果", () => {
    const tag = nextTag();
    let dispatched: boolean | undefined;
    defineCustomElement({
      tag,
      emitOptions: { bubbles: true, cancelable: true, composed: true },
      setup: (_, ctx) => {
        Promise.resolve().then(() => {
          dispatched = ctx.emit("custom-event", 42);
        });
        return {};
      },
      render: () => document.createElement("div")
    });
    const parent = document.createElement("section");
    const el = document.createElement(tag);
    const handler = vi.fn((event: Event) => event.preventDefault());
    parent.addEventListener("custom-event", handler);
    parent.appendChild(el);
    document.body.appendChild(parent);

    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(handler).toHaveBeenCalledTimes(1);
        const evt = handler.mock.calls[0]?.[0] as CustomEvent;
        expect(evt.bubbles).toBe(true);
        expect(evt.cancelable).toBe(true);
        expect(evt.composed).toBe(true);
        expect(evt.defaultPrevented).toBe(true);
        expect(dispatched).toBe(false);
        resolve();
      });
    });
  });

  it("emitOptions.events 可以覆盖单个事件的传播选项", () => {
    const tag = nextTag();
    defineCustomElement({
      tag,
      emitOptions: {
        bubbles: true,
        composed: true,
        events: { local: { bubbles: false, composed: false } }
      },
      setup: (_, ctx) => {
        Promise.resolve().then(() => ctx.emit("local"));
        return {};
      },
      render: () => document.createElement("div")
    });
    const parent = document.createElement("section");
    const el = document.createElement(tag);
    const hostHandler = vi.fn();
    const parentHandler = vi.fn();
    el.addEventListener("local", hostHandler);
    parent.addEventListener("local", parentHandler);
    parent.appendChild(el);
    document.body.appendChild(parent);

    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(hostHandler).toHaveBeenCalledTimes(1);
        expect(parentHandler).not.toHaveBeenCalled();
        const evt = hostHandler.mock.calls[0]?.[0] as CustomEvent;
        expect(evt.bubbles).toBe(false);
        expect(evt.composed).toBe(false);
        resolve();
      });
    });
  });
});

afterEach(() => {
  // 清理所有测试创建的元素
  document.body.innerHTML = "";
});
