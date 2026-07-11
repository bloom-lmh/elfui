// B2/B3 编译器 端到端测试
//
// 跑通"模板 -> render 函数 -> 真实 DOM 更新"全链路。

import { afterEach, describe, expect, it } from "vitest";

import { useReactive, useRef } from "@elfui/reactivity";
import { defineCustomElement, onActivated, onDeactivated } from "@elfui/runtime";

import { compile } from "../index";

const setupCtx = (state: Record<string, unknown> = {}) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return {
    state,
    props: {},
    emit: () => {},
    host,
    shadow: null,
    cleanup: () => document.body.removeChild(host)
  };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("基础渲染", () => {
  it("纯文本", () => {
    const render = compile("hello");
    const ctx = setupCtx();
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.textContent).toBe("hello");
    ctx.cleanup();
  });

  it("简单元素", () => {
    const render = compile("<p>hi</p>");
    const ctx = setupCtx();
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("p")?.textContent).toBe("hi");
    ctx.cleanup();
  });

  it("SVG 节点使用 SVG namespace 创建", () => {
    const render = compile('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>');
    const ctx = setupCtx();
    ctx.host.appendChild(render(ctx));
    const svg = ctx.host.querySelector("svg")!;
    const circle = ctx.host.querySelector("circle")!;

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
    ctx.cleanup();
  });

  it("插值", () => {
    const name = useRef("world");
    const render = compile("hello {{ name }}!");
    const ctx = setupCtx({ name });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.textContent).toBe("hello world!");
    name.value = "elfui";
    expect(ctx.host.textContent).toBe("hello elfui!");
    ctx.cleanup();
  });

  it("元素内插值", () => {
    const count = useRef(0);
    const render = compile("<span>{{ count }}</span>");
    const ctx = setupCtx({ count });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("span")?.textContent).toBe("0");
    count.value = 42;
    expect(ctx.host.querySelector("span")?.textContent).toBe("42");
    ctx.cleanup();
  });

  it("不会把响应式对象自己的 value 字段链误剥离", () => {
    const item = useReactive({
      value: { label: "real-value" },
      label: "wrong"
    });
    const render = compile("<span>{{ item.value.label }}</span>");
    const ctx = setupCtx({ item });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("span")?.textContent).toBe("real-value");
    ctx.cleanup();
  });

  it("DEV 下会报告 runtime compile 表达式错误位置", () => {
    const originalError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]): void => {
      calls.push(args);
    };

    try {
      const render = compile("<span>{{ missing.value }}</span>");
      const ctx = setupCtx();
      ctx.host.appendChild(render(ctx));

      expect(ctx.host.querySelector("span")?.textContent).toBe("");
      expect(calls).toHaveLength(1);
      expect(String(calls[0]?.[0])).toContain("[elfui:runtime-compiler]");
      expect(String(calls[0]?.[0])).toContain("ELF_RUNTIME_EXPRESSION");
      expect(String(calls[0]?.[0])).toContain("interpolation");
      expect(String(calls[0]?.[0])).toContain("<div>");
      expect(String(calls[0]?.[0])).toContain("line 1, column 9");
      expect(String(calls[0]?.[0])).toContain("missing.value");
      expect(calls[0]?.[1]).toBeInstanceOf(Error);
      ctx.cleanup();
    } finally {
      console.error = originalError;
    }
  });

  it("PascalCase 本地组件会解析为真实 custom element tag 并按需注册", () => {
    const childTag = `elf-local-child-${Math.random().toString(36).slice(2, 8)}`;
    const Child = defineCustomElement(
      {
        tag: childTag,
        render: () => {
          const span = document.createElement("span");
          span.textContent = "child";
          return span;
        }
      },
      { register: false }
    );
    expect(customElements.get(childTag)).toBeUndefined();

    const render = compile("<Panel></Panel>");
    const ctx = {
      ...setupCtx(),
      components: { Panel: Child }
    };
    ctx.host.appendChild(render(ctx));

    expect(customElements.get(childTag)).toBe(Child);
    expect(ctx.host.querySelector(childTag)?.shadowRoot?.textContent).toBe("child");
    ctx.cleanup();
  });
});

describe("属性绑定", () => {
  it(":foo 静态值绑定", () => {
    const id = useRef("a");
    const render = compile('<div :id="id" />');
    const ctx = setupCtx({ id });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("div")?.getAttribute("id")).toBe("a");
    id.value = "b";
    expect(ctx.host.querySelector("div")?.getAttribute("id")).toBe("b");
    ctx.cleanup();
  });

  it(":class 对象形态", () => {
    const active = useRef(true);
    const render = compile('<div :class="{ active }" />');
    const ctx = setupCtx({ active });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("div")?.getAttribute("class")).toBe("active");
    active.value = false;
    expect(ctx.host.querySelector("div")?.getAttribute("class") ?? "").toBe("");
    ctx.cleanup();
  });

  it(":style 对象形态", () => {
    const fz = useRef(14);
    const render = compile("<p :style=\"{ fontSize: fz, color: 'red' }\">x</p>");
    const ctx = setupCtx({ fz });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("p")?.getAttribute("style")).toContain("font-size: 14px");
    expect(ctx.host.querySelector("p")?.getAttribute("style")).toContain("color: red");
    ctx.cleanup();
  });
});

describe("事件", () => {
  it("@click 触发", () => {
    let count = 0;
    const inc = (): void => {
      count++;
    };
    const render = compile('<button @click="inc">x</button>');
    const ctx = setupCtx({ inc });
    ctx.host.appendChild(render(ctx));
    const btn = ctx.host.querySelector("button");
    btn?.dispatchEvent(new Event("click"));
    btn?.dispatchEvent(new Event("click"));
    expect(count).toBe(2);
    ctx.cleanup();
  });

  it("@click.once 只触发一次", () => {
    let count = 0;
    const render = compile('<button @click.once="onClick">x</button>');
    const ctx = setupCtx({
      onClick: () => {
        count++;
      }
    });
    ctx.host.appendChild(render(ctx));
    const btn = ctx.host.querySelector("button");
    btn?.dispatchEvent(new Event("click"));
    btn?.dispatchEvent(new Event("click"));
    expect(count).toBe(1);
    ctx.cleanup();
  });

  it("@click.stop 停止冒泡", () => {
    let outer = 0;
    let inner = 0;
    const render = compile('<div @click="onOuter"><button @click.stop="onInner">x</button></div>');
    const ctx = setupCtx({
      onOuter: () => {
        outer++;
      },
      onInner: () => {
        inner++;
      }
    });
    ctx.host.appendChild(render(ctx));
    const btn = ctx.host.querySelector("button");
    btn?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(inner).toBe(1);
    expect(outer).toBe(0);
    ctx.cleanup();
  });

  it("内联表达式 + $event", () => {
    let captured: unknown = null;
    const render = compile('<button @click="onClick($event, 1)">x</button>');
    const ctx = setupCtx({
      onClick: (ev: Event, x: number) => {
        captured = { ev, x };
      }
    });
    ctx.host.appendChild(render(ctx));
    ctx.host.querySelector("button")?.dispatchEvent(new Event("click"));
    expect(captured).toBeTruthy();
    expect((captured as { x: number }).x).toBe(1);
    ctx.cleanup();
  });

  it("单标识符方法自动传递 $event", () => {
    let captured: unknown = null;
    const render = compile('<button @click="onClick">x</button>');
    const ctx = setupCtx({
      onClick: (ev: Event) => {
        captured = ev;
      }
    });
    ctx.host.appendChild(render(ctx));
    const ev = new Event("click");
    ctx.host.querySelector("button")?.dispatchEvent(ev);
    expect(captured).toBe(ev);
    ctx.cleanup();
  });

  it("内联表达式直接使用 $event 属性", () => {
    const clickedType = useRef("");
    const render = compile('<button @click="clickedType = $event.type">x</button>');
    const ctx = setupCtx({ clickedType });
    ctx.host.appendChild(render(ctx));
    ctx.host.querySelector("button")?.dispatchEvent(new Event("click"));
    expect(clickedType.value).toBe("click");
    ctx.cleanup();
  });

  it("DEV 下会报告事件表达式错误且同一表达式只提示一次", () => {
    const originalError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]): void => {
      calls.push(args);
    };

    try {
      const render = compile(`<button @click="throw new Error('boom')">x</button>`);
      const ctx = setupCtx();
      ctx.host.appendChild(render(ctx));
      const button = ctx.host.querySelector("button");

      button?.dispatchEvent(new Event("click"));
      button?.dispatchEvent(new Event("click"));

      expect(calls).toHaveLength(1);
      expect(String(calls[0]?.[0])).toContain("ELF_RUNTIME_EXPRESSION");
      expect(String(calls[0]?.[0])).toContain("@click");
      expect(String(calls[0]?.[0])).toContain("throw new Error");
      expect(String(calls[0]?.[0])).toContain("line 1, column 16");
      expect(calls[0]?.[1]).toBeInstanceOf(Error);
      ctx.cleanup();
    } finally {
      console.error = originalError;
    }
  });
});

describe("v-if", () => {
  it("基础切换", () => {
    const visible = useRef(true);
    const render = compile('<p v-if="visible">x</p>');
    const ctx = setupCtx({ visible });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("p")?.textContent).toBe("x");
    visible.value = false;
    expect(ctx.host.querySelector("p")).toBeNull();
    visible.value = true;
    expect(ctx.host.querySelector("p")?.textContent).toBe("x");
    ctx.cleanup();
  });
});

describe("v-once / v-memo", () => {
  it("v-once 只渲染初始值", async () => {
    const count = useRef(1);
    const render = compile("<p v-once>{{ count }}</p>");
    const ctx = setupCtx({ count });
    ctx.host.appendChild(render(ctx));

    expect(ctx.host.querySelector("p")?.textContent).toBe("1");
    count.set(2);
    await Promise.resolve();
    expect(ctx.host.querySelector("p")?.textContent).toBe("1");
    ctx.cleanup();
  });

  it("v-memo 只在依赖数组变化时刷新子树", async () => {
    const version = useRef(1);
    const label = useRef("A");
    const render = compile('<p v-memo="[version]">{{ label }}</p>');
    const ctx = setupCtx({ version, label });
    ctx.host.appendChild(render(ctx));

    expect(ctx.host.querySelector("p")?.textContent).toBe("A");
    label.set("B");
    await Promise.resolve();
    expect(ctx.host.querySelector("p")?.textContent).toBe("A");

    version.set(2);
    await Promise.resolve();
    expect(ctx.host.querySelector("p")?.textContent).toBe("B");
    ctx.cleanup();
  });
});

describe("运行时编译诊断", () => {
  it("DEV 下未知指令输出结构化 warning", () => {
    const originalWarn = console.warn;
    const calls: unknown[][] = [];
    console.warn = (...args: unknown[]): void => {
      calls.push(args);
    };

    try {
      const render = compile('<p v-missing="value">x</p>');
      const ctx = setupCtx({ value: true });
      ctx.host.appendChild(render(ctx));

      expect(calls).toHaveLength(1);
      expect(String(calls[0]?.[0])).toContain("ELF_RUNTIME_UNKNOWN_DIRECTIVE");
      expect(String(calls[0]?.[0])).toContain("v-missing");
      ctx.cleanup();
    } finally {
      console.warn = originalWarn;
    }
  });

  it("DEV 下 v-for 语法错误输出结构化 error", () => {
    const originalError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]): void => {
      calls.push(args);
    };

    try {
      const render = compile('<ul><li v-for="bad expr">{{ bad }}</li></ul>');
      const ctx = setupCtx();
      ctx.host.appendChild(render(ctx));

      expect(calls).toHaveLength(1);
      expect(String(calls[0]?.[0])).toContain("ELF_RUNTIME_V_FOR_PARSE");
      expect(String(calls[0]?.[0])).toContain("bad expr");
      ctx.cleanup();
    } finally {
      console.error = originalError;
    }
  });
});

describe("v-show", () => {
  it("切换 display", () => {
    const visible = useRef(true);
    const render = compile('<p v-show="visible">x</p>');
    const ctx = setupCtx({ visible });
    ctx.host.appendChild(render(ctx));
    const p = ctx.host.querySelector("p") as HTMLElement;
    expect(p.style.display).toBe("");
    visible.value = false;
    expect(p.style.display).toBe("none");
    ctx.cleanup();
  });
});

describe("v-for", () => {
  it("数组列表", () => {
    const items = useReactive([1, 2, 3]);
    const render = compile('<ul><li v-for="n in items" :key="n">{{ n }}</li></ul>');
    const ctx = setupCtx({ items });
    ctx.host.appendChild(render(ctx));
    let lis = ctx.host.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe("1");
    items.push(4);
    lis = ctx.host.querySelectorAll("li");
    expect(lis).toHaveLength(4);
    expect(lis[3]?.textContent).toBe("4");
    ctx.cleanup();
  });

  it("(item, index)", () => {
    const items = useReactive(["a", "b"]);
    const render = compile('<ul><li v-for="(it, i) in items" :key="i">{{ i }}:{{ it }}</li></ul>');
    const ctx = setupCtx({ items });
    ctx.host.appendChild(render(ctx));
    const lis = ctx.host.querySelectorAll("li");
    expect(lis[0]?.textContent).toBe("0:a");
    expect(lis[1]?.textContent).toBe("1:b");
    ctx.cleanup();
  });
});

describe("v-model", () => {
  it("input 文本", () => {
    const value = useRef("hello");
    const render = compile('<input v-model="value" />');
    const ctx = setupCtx({ value });
    ctx.host.appendChild(render(ctx));
    const inp = ctx.host.querySelector("input") as HTMLInputElement;
    expect(inp.value).toBe("hello");
    // 模拟用户输入
    inp.value = "world";
    inp.dispatchEvent(new Event("input"));
    expect(value.value).toBe("world");
    ctx.cleanup();
  });

  it("checkbox", () => {
    const checked = useRef(false);
    const render = compile('<input type="checkbox" v-model="checked" />');
    const ctx = setupCtx({ checked });
    ctx.host.appendChild(render(ctx));
    const inp = ctx.host.querySelector("input") as HTMLInputElement;
    expect(inp.checked).toBe(false);
    inp.checked = true;
    inp.dispatchEvent(new Event("change"));
    expect(checked.value).toBe(true);
    ctx.cleanup();
  });

  it("custom element v-model 保留数组 detail", () => {
    const tag = `elf-compile-array-model-${Math.random().toString(36).slice(2, 8)}`;
    customElements.define(
      tag,
      class extends HTMLElement {
        modelValue: unknown[] = [];
      }
    );
    const selected = useRef<string[]>([]);
    const render = compile(`<${tag} v-model="selected"></${tag}>`);
    const ctx = setupCtx({ selected });
    ctx.host.appendChild(render(ctx));
    const el = ctx.host.querySelector(tag) as HTMLElement & { modelValue: unknown[] };

    expect(el.modelValue).toEqual([]);
    el.dispatchEvent(new CustomEvent("update:modelValue", { detail: ["a", "b"] }));

    expect(selected.value).toEqual(["a", "b"]);
    ctx.cleanup();
  });
});

describe("v-text / v-html", () => {
  it("v-text", () => {
    const msg = useRef("hi");
    const render = compile('<p v-text="msg" />');
    const ctx = setupCtx({ msg });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("p")?.textContent).toBe("hi");
    msg.value = "bye";
    expect(ctx.host.querySelector("p")?.textContent).toBe("bye");
    ctx.cleanup();
  });

  it("v-html", () => {
    const html = useRef("<em>x</em>");
    const render = compile('<p v-html="html" />');
    const ctx = setupCtx({ html });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("p em")?.textContent).toBe("x");
    ctx.cleanup();
  });
});

describe("Transition & TransitionGroup", () => {
  it("Transition v-if 切换", () => {
    const show = useRef(true);
    const render = compile('<Transition name="fade"><div v-if="show">box</div></Transition>');
    const ctx = setupCtx({ show });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("div")?.textContent).toBe("box");
    show.value = false;
    ctx.cleanup();
  });

  it("TransitionGroup v-for 列表", () => {
    const list = useReactive(["a", "b"]);
    const render = compile(
      '<TransitionGroup tag="ul" name="list"><li v-for="it in list" :key="it">{{ it }}</li></TransitionGroup>'
    );
    const ctx = setupCtx({ list });
    ctx.host.appendChild(render(ctx));
    const ul = ctx.host.querySelector("ul")!;
    expect(ul).toBeTruthy();
    expect(ul.tagName.toLowerCase()).toBe("ul");
    expect(ul.textContent).toBe("ab");
    ctx.cleanup();
  });
});

describe("KeepAlive & Suspense", () => {
  it("KeepAlive 缓存 component :is 动态组件", async () => {
    const tagA = `elf-ka-a-${Math.random().toString(36).slice(2, 8)}`;
    const tagB = `elf-ka-b-${Math.random().toString(36).slice(2, 8)}`;
    let createdA = 0;
    let createdB = 0;
    let deactivatedA = 0;

    defineCustomElement({
      tag: tagA,
      setup() {
        createdA++;
        onDeactivated(() => {
          deactivatedA++;
        });
        onActivated(() => undefined);
        return {};
      },
      render: () => document.createElement("span")
    });
    defineCustomElement({
      tag: tagB,
      setup() {
        createdB++;
        return {};
      },
      render: () => document.createElement("span")
    });

    const current = useRef(tagA);
    const render = compile('<KeepAlive><component :is="current"></component></KeepAlive>');
    const ctx = setupCtx({ current });
    ctx.host.appendChild(render(ctx));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(ctx.host.querySelector(tagA)).toBeTruthy();
    expect(createdA).toBe(1);

    current.value = tagB;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(ctx.host.querySelector(tagB)).toBeTruthy();
    expect(createdB).toBe(1);
    expect(deactivatedA).toBe(1);

    current.value = tagA;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(ctx.host.querySelector(tagA)).toBeTruthy();
    expect(createdA).toBe(1);
    ctx.cleanup();
  });

  it("Suspense 支持 source + fallback/default", async () => {
    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolveFn = r;
    });
    const source = useRef<Promise<void> | null>(promise);
    const render = compile(
      '<Suspense :source="source"><p>done</p><template #fallback><span>loading</span></template></Suspense>'
    );
    const ctx = setupCtx({ source });
    ctx.host.appendChild(render(ctx));
    await new Promise<void>((r) => queueMicrotask(r));
    expect(ctx.host.querySelector("span")?.textContent).toBe("loading");

    resolveFn();
    await promise;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(ctx.host.querySelector("p")?.textContent).toBe("done");
    expect(ctx.host.querySelector("span")).toBeNull();
    ctx.cleanup();
  });
});
