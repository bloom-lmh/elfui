// B3.6 离线 codegen — 编译产物可独立运行

import { useReactive, useRef } from "@elfui/reactivity";
import * as runtime from "@elfui/runtime";
import * as runtimeInternal from "@elfui/runtime/internal";
import { afterEach, describe, expect, it } from "vitest";

import { codegen } from "../codegen";

afterEach(() => {
  document.body.innerHTML = "";
});

/** 用 new Function 把生成的源码当作 ESM module 执行：
 *  - 把 `import { ... } from "@elfui/runtime/internal"` 替换成从注入的 runtime 对象解构
 *  - 把 `export default function render(ctx) { ... }` 改成 `return function render(ctx){...}`
 *  这样可以在测试里直接拿到 render 函数，无需配置真正的 ESM loader。
 */
const evalCode = (code: string, helpers: string[]): ((ctx: runtime.RenderContext) => Node) => {
  const importLine = helpers.length ? `const { ${helpers.join(", ")} } = __runtime;` : "";
  const transformed = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?/, importLine)
    .replace(/export default function/, "return function");
  const factory = new Function("__runtime", transformed);
  return factory(runtimeInternal) as (ctx: runtime.RenderContext) => Node;
};

const makeCtx = (state: Record<string, unknown>): runtime.RenderContext => ({
  state,
  props: {},
  emit: () => true,
  host: document.body,
  shadow: null
});

describe("B3.6 codegen", () => {
  it("生成的源码包含 import 和 export default", () => {
    const { code, helpers } = codegen(`<div>{{ msg }}</div>`);
    expect(code).toContain('from "@elfui/runtime/internal"');
    expect(code).toContain("export default function render");
    expect(helpers).toContain("text");
  });

  it("为动态 binding 生成模板行列元数据", () => {
    const { code } = codegen(`<div>\n  {{ msg }}\n  <span :title="msg">x</span>\n</div>`);

    expect(code).toContain("source: { line: 2, column: 5 }");
    expect(code).toContain("source: { line: 3, column: 16 }");
  });

  it("为 v-model 与控制流生成具名 binding 元数据", () => {
    const { code } = codegen(
      `<input v-model="value" />\n<p v-show="visible">x</p>\n<div v-if="visible">y</div>\n<li v-for="item in items">{{ item }}</li>`
    );

    expect(code).toMatch(/name: "v-model", source: \{ line: 1, column: \d+ \}/);
    expect(code).toMatch(/name: "v-show", source: \{ line: 2, column: \d+ \}/);
    expect(code).toMatch(/name: "v-if", source: \{ line: 3, column: \d+ \}/);
    expect(code).toMatch(/name: "v-for", source: \{ line: 4, column: \d+ \}/);
  });

  it("列表局部作用域使用分层代理而不是复制父 state", () => {
    const { code, helpers } = codegen(
      '<ul><li v-for="(item, index) in items" :key="item.id">{{ index }}-{{ item.name }}</li></ul>'
    );

    expect(helpers).toContain("extendRenderState");
    expect(code).not.toContain("...ctx.state");
  });

  it("静态 ref 生成 template ref 注册而不是普通 attribute", () => {
    const { code, helpers } = codegen('<div ref="chart"></div>');

    expect(helpers).toContain("setTemplateRef");
    expect(code).toContain('setTemplateRef(ctx.host, "chart"');
    expect(code).not.toContain('setAttribute("ref"');
  });

  it("插值绑定可执行", async () => {
    const { code, helpers } = codegen(`<p>{{ msg }}</p>`);
    const render = evalCode(code, helpers);
    const msg = useRef("hello");
    const root = render(makeCtx({ msg }));
    document.body.appendChild(root);
    expect(document.body.querySelector("p")?.textContent).toBe("hello");

    msg.set("world");
    await Promise.resolve();
    expect(document.body.querySelector("p")?.textContent).toBe("world");
  });

  it("离线生成代码保留插值内部的 }}", () => {
    const { code, helpers } = codegen(
      '<p>{{ "}}" }}|{{ `before }} ${name} after` }}|{{ ({ value: "ok" }).value }}</p>'
    );
    const render = evalCode(code, helpers);
    document.body.appendChild(render(makeCtx({ name: "elfui" })));

    expect(document.body.querySelector("p")?.textContent).toBe("}}|before }} elfui after|ok");
  });

  it("SVG 节点使用 SVG namespace 创建", () => {
    const { code, helpers } = codegen(
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>'
    );
    const render = evalCode(code, helpers);
    document.body.appendChild(render(makeCtx({})));

    expect(document.body.querySelector("svg")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(document.body.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("不会把对象字段链里的 value 当成 ref value 剥离", () => {
    const { code, helpers } = codegen(`<p>{{ item.value.label }}</p>`);
    const render = evalCode(code, helpers);
    const item = useReactive({
      value: { label: "real-value" },
      label: "wrong"
    });
    document.body.appendChild(render(makeCtx({ item })));
    expect(document.body.querySelector("p")?.textContent).toBe("real-value");
  });

  it("用语义化 helper 区分字符串、普通对象字段和 Ref value", async () => {
    const { code, helpers } = codegen(
      `<div><p>{{ "foo.value" }}|{{ item.value }}|{{ count.value }}</p><button @click="count.value = count.value + 1, item.value = 'after'">update</button></div>`
    );
    const render = evalCode(code, helpers);
    const item = useReactive({ value: "before" });
    const count = useRef(1);
    document.body.appendChild(render(makeCtx({ item, count })));

    expect(document.body.querySelector("p")?.textContent).toBe("foo.value|before|1");
    document.body.querySelector("button")?.dispatchEvent(new Event("click"));
    await Promise.resolve();

    expect(item.value).toBe("after");
    expect(count.value).toBe(2);
    expect(document.body.querySelector("p")?.textContent).toBe("foo.value|after|2");
    expect(helpers).toEqual(expect.arrayContaining(["readTemplateValue", "writeTemplateValue"]));
  });

  it("v-if / v-else 链可执行", async () => {
    const { code, helpers } = codegen(
      `<div><span v-if="n === 1">A</span><span v-else-if="n === 2">B</span><span v-else>C</span></div>`
    );
    const render = evalCode(code, helpers);
    const n = useRef(1);
    document.body.appendChild(render(makeCtx({ n })));
    expect(document.body.querySelector("div")?.textContent).toBe("A");

    n.set(2);
    await Promise.resolve();
    expect(document.body.querySelector("div")?.textContent).toBe("B");

    n.set(99);
    await Promise.resolve();
    expect(document.body.querySelector("div")?.textContent).toBe("C");
  });

  it("<template v-if> 分支在离线 codegen 中保持透明", async () => {
    const { code, helpers } = codegen(
      `<nav><template v-if="mode === 'horizontal'"><span>Horizontal</span></template><template v-else><button class="menu-item">Vertical</button></template></nav>`
    );
    const render = evalCode(code, helpers);
    const mode = useRef("vertical");
    document.body.appendChild(render(makeCtx({ mode })));

    expect(document.body.querySelector("template")).toBeNull();
    expect(document.body.querySelector(".menu-item")?.textContent).toBe("Vertical");

    mode.set("horizontal");
    await Promise.resolve();
    expect(document.body.querySelector("template")).toBeNull();
    expect(document.body.querySelector("span")?.textContent).toBe("Horizontal");
  });

  it("v-for 列表可执行", async () => {
    const { code, helpers } = codegen(
      `<ul><li v-for="(item, i) in list" :key="item">{{ item }}</li></ul>`
    );
    const render = evalCode(code, helpers);
    const list = useReactive(["a", "b", "c"]);
    document.body.appendChild(render(makeCtx({ list })));
    const ul = document.body.querySelector("ul")!;
    expect(ul.children.length).toBe(3);
    expect(ul.textContent).toBe("abc");
  });

  it("<template v-for> 在离线 codegen 中渲染为可见子节点", async () => {
    const { code, helpers } = codegen(
      `<div><template v-for="item in list" :key="item"><span class="row">{{ item }}</span></template></div>`
    );
    const render = evalCode(code, helpers);
    const list = useReactive(["a", "b"]);
    document.body.appendChild(render(makeCtx({ list })));

    expect(document.body.querySelector("template")).toBeNull();
    expect(Array.from(document.body.querySelectorAll(".row")).map((el) => el.textContent)).toEqual([
      "a",
      "b"
    ]);

    list.push("c");
    await Promise.resolve();
    expect(Array.from(document.body.querySelectorAll(".row")).map((el) => el.textContent)).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("v-once 离线 codegen 只渲染初始值", async () => {
    const { code, helpers } = codegen(`<p v-once>{{ count }}</p>`);
    expect(helpers).toContain("renderOnce");
    const render = evalCode(code, helpers);
    const count = useRef(1);
    document.body.appendChild(render(makeCtx({ count })));

    expect(document.body.querySelector("p")?.textContent).toBe("1");
    count.set(2);
    await Promise.resolve();
    expect(document.body.querySelector("p")?.textContent).toBe("1");
  });

  it("v-memo 离线 codegen 只在依赖变化时刷新", async () => {
    const { code, helpers } = codegen(`<p v-memo="[version]">{{ label }}</p>`);
    expect(helpers).toContain("branch");
    const render = evalCode(code, helpers);
    const version = useRef(1);
    const label = useRef("A");
    document.body.appendChild(render(makeCtx({ version, label })));

    expect(document.body.querySelector("p")?.textContent).toBe("A");
    label.set("B");
    await Promise.resolve();
    expect(document.body.querySelector("p")?.textContent).toBe("A");

    version.set(2);
    await Promise.resolve();
    expect(document.body.querySelector("p")?.textContent).toBe("B");
  });

  it("事件 + 修饰符可执行", () => {
    const { code, helpers } = codegen(`<button @click.stop="onClick($event)">x</button>`);
    const render = evalCode(code, helpers);
    let clicked = 0;
    let parentBubbled = 0;

    const wrap = document.createElement("div");
    wrap.addEventListener("click", () => {
      parentBubbled++;
    });
    document.body.appendChild(wrap);
    wrap.appendChild(
      render(
        makeCtx({
          onClick: () => {
            clicked++;
          }
        })
      )
    );
    const btn = wrap.querySelector("button")!;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toBe(1);
    expect(parentBubbled).toBe(0); // .stop 阻止冒泡
  });

  it("单标识符方法自动传递 $event (codegen)", () => {
    const { code, helpers } = codegen('<button @click="onClick">x</button>');
    const render = evalCode(code, helpers);
    let captured: unknown = null;
    document.body.appendChild(
      render(
        makeCtx({
          onClick: (ev: Event) => {
            captured = ev;
          }
        })
      )
    );
    const ev = new Event("click");
    document.body.querySelector("button")?.dispatchEvent(ev);
    expect(captured).toBe(ev);
  });

  it("内联表达式直接使用 $event 属性 (codegen)", () => {
    const { code, helpers } = codegen('<button @click="clickedType = $event.type">x</button>');
    const render = evalCode(code, helpers);
    const clickedType = useRef("");
    document.body.appendChild(
      render(
        makeCtx({
          clickedType
        })
      )
    );
    document.body.querySelector("button")?.dispatchEvent(new Event("click"));
    expect(clickedType.value).toBe("click");
  });

  it("custom element v-model 可执行", async () => {
    const tag = `elf-codegen-model-${Math.random().toString(36).slice(2, 8)}`;
    customElements.define(
      tag,
      class extends HTMLElement {
        open = false;
      }
    );
    const { code, helpers } = codegen(`<${tag} v-model:open="visible"></${tag}>`);
    const render = evalCode(code, helpers);
    const visible = useRef(false);

    document.body.appendChild(render(makeCtx({ visible })));
    const el = document.body.querySelector<HTMLElement & { open: boolean }>(tag)!;
    expect(el.open).toBe(false);

    el.dispatchEvent(new CustomEvent("update:open", { detail: true }));
    expect(visible.value).toBe(true);

    visible.set(false);
    await Promise.resolve();
    expect(el.open).toBe(false);
  });

  it("显式 value 的 v-model 会区分 Ref 与普通对象字段", () => {
    const { code, helpers } = codegen(
      '<div><input id="ref" v-model="text.value" /><input id="object" v-model="item.value" /></div>'
    );
    const render = evalCode(code, helpers);
    const text = useRef("ref-before");
    const item = useReactive({ value: "object-before" });
    document.body.appendChild(render(makeCtx({ text, item })));
    const refInput = document.body.querySelector("#ref") as HTMLInputElement;
    const objectInput = document.body.querySelector("#object") as HTMLInputElement;

    expect(refInput.value).toBe("ref-before");
    expect(objectInput.value).toBe("object-before");
    refInput.value = "ref-after";
    objectInput.value = "object-after";
    refInput.dispatchEvent(new Event("input"));
    objectInput.dispatchEvent(new Event("input"));

    expect(text.value).toBe("ref-after");
    expect(item.value).toBe("object-after");
  });

  it("custom element v-model 保留数组 detail", () => {
    const tag = `elf-codegen-array-model-${Math.random().toString(36).slice(2, 8)}`;
    customElements.define(
      tag,
      class extends HTMLElement {
        modelValue: unknown[] = [];
      }
    );
    const { code, helpers } = codegen(`<${tag} v-model="selected"></${tag}>`);
    const render = evalCode(code, helpers);
    const selected = useRef<string[]>([]);

    document.body.appendChild(render(makeCtx({ selected })));
    const el = document.body.querySelector(tag)!;
    el.dispatchEvent(new CustomEvent("update:modelValue", { detail: ["a", "b"] }));

    expect(selected.value).toEqual(["a", "b"]);
  });

  it("Transition 离线 codegen 可执行", () => {
    const { code, helpers } = codegen(
      '<Transition name="fade"><div v-if="show">box</div></Transition>'
    );
    expect(helpers).toContain("transition");
    expect(helpers).toContain("mark");
    const render = evalCode(code, helpers);
    const show = useRef(true);
    const root = render(makeCtx({ show }));
    document.body.appendChild(root);
    expect(document.body.querySelector("div")?.textContent).toBe("box");
  });

  it("TransitionGroup 离线 codegen 可执行", () => {
    const { code, helpers } = codegen(
      '<TransitionGroup tag="ul" name="list"><li v-for="it in list" :key="it">{{ it }}</li></TransitionGroup>'
    );
    expect(helpers).toContain("transitionGroup");
    const render = evalCode(code, helpers);
    const list = useReactive(["a", "b"]);
    const root = render(makeCtx({ list }));
    document.body.appendChild(root);
    const ul = document.body.querySelector("ul")!;
    expect(ul).toBeTruthy();
    expect(ul.textContent).toBe("ab");
  });

  it("KeepAlive 离线 codegen 可执行", async () => {
    const tag = `elf-codegen-ka-${Math.random().toString(36).slice(2, 8)}`;
    let created = 0;
    runtime.defineCustomElement({
      tag,
      setup() {
        created++;
        return {};
      },
      render: () => document.createElement("span")
    });
    const { code, helpers } = codegen(`<KeepAlive><component :is="current" /></KeepAlive>`);
    expect(helpers).toContain("keepAlive");
    const render = evalCode(code, helpers);
    const current = useRef(tag);
    const root = render(makeCtx({ current }));
    document.body.appendChild(root);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(document.body.querySelector(tag)).toBeTruthy();
    expect(created).toBe(1);
  });

  it("Suspense 离线 codegen 可执行", async () => {
    let resolveFn: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolveFn = r;
    });
    const { code, helpers } = codegen(
      '<Suspense :source="source"><p>done</p><template #fallback><span>loading</span></template></Suspense>'
    );
    expect(helpers).toContain("suspense");
    const render = evalCode(code, helpers);
    const source = useRef<Promise<void> | null>(promise);
    const root = render(makeCtx({ source }));
    document.body.appendChild(root);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(document.body.querySelector("span")?.textContent).toBe("loading");
    resolveFn();
    await promise;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(document.body.querySelector("p")?.textContent).toBe("done");
  });
});
