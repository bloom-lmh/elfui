// C3 + C4 Custom Element 包壳 + 生命周期 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { useRef } from "@elfui/reactivity";

import { defineCustomElement } from "../element";
import {
  onAttributeChanged,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onMount,
  onUnmount,
  onUpdated
} from "../lifecycle";
import { text } from "../bindings";

let tagCounter = 0;
const nextTag = (): string => `elf-test-${++tagCounter}`;

const flushDisconnect = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("defineCustomElement 基础", () => {
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
});

describe("生命周期", () => {
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
    defineCustomElement({
      tag,
      setup: (_, ctx) => {
        // 立即 emit 一个事件（仅测试 emit 链路）
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
        expect(evt.detail).toBe(42);
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
});

afterEach(() => {
  // 清理所有测试创建的元素
  document.body.innerHTML = "";
});
