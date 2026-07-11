// L3.1 静态提升验证
//
// 思路：编译两次同一个静态模板，第一次构建 template，第二次 cloneNode 复用。
// 验证：
// 1. 完全静态模板：渲染结果正确
// 2. 含动态点的模板：仍走 effect 路径
// 3. 嵌套静态子树：在动态外层中复用

import { useRef } from "@elfui/reactivity";
import { afterEach, describe, expect, it } from "vitest";

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

describe("L3.1 静态提升", () => {
  it("完全静态模板渲染正确", () => {
    const render = compile(`<div class="card"><h1>Title</h1><p>Body</p></div>`);
    const ctx = setupCtx();
    ctx.host.appendChild(render(ctx));

    expect(ctx.host.querySelector("h1")?.textContent).toBe("Title");
    expect(ctx.host.querySelector("p")?.textContent).toBe("Body");
    expect(ctx.host.querySelector(".card")).not.toBeNull();
    ctx.cleanup();
  });

  it("两次渲染产生不同 DOM 节点（cloneNode 不共享）", () => {
    const render = compile(`<div class="card"><span>x</span></div>`);
    const ctx1 = setupCtx();
    const ctx2 = setupCtx();
    const n1 = render(ctx1) as HTMLElement;
    const n2 = render(ctx2) as HTMLElement;
    expect(n1).not.toBe(n2);
    expect(n1.querySelector("span")).not.toBe(n2.querySelector("span"));
    ctx1.cleanup();
    ctx2.cleanup();
  });

  it("含 {{ }} 的模板不走静态路径", () => {
    const count = useRef(0);
    const render = compile(`<div>Count: {{ count }}</div>`);
    const ctx = setupCtx({ count });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("div")?.textContent).toBe("Count: 0");
    count.value = 5;
    expect(ctx.host.querySelector("div")?.textContent).toBe("Count: 5");
    ctx.cleanup();
  });

  it("含 :class 的模板不走静态路径", () => {
    const active = useRef(true);
    const render = compile(`<div :class="{ active }">x</div>`);
    const ctx = setupCtx({ active });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector("div")?.getAttribute("class")).toBe("active");
    active.value = false;
    expect(ctx.host.querySelector("div")?.getAttribute("class") ?? "").toBe("");
    ctx.cleanup();
  });

  it("含 @click 的模板不走静态路径", () => {
    let clicked = 0;
    const onClick = () => {
      clicked++;
    };
    const render = compile(`<button @click="onClick">x</button>`);
    const ctx = setupCtx({ onClick });
    ctx.host.appendChild(render(ctx));
    ctx.host.querySelector("button")?.dispatchEvent(new MouseEvent("click"));
    expect(clicked).toBe(1);
    ctx.cleanup();
  });

  it("含 ref 的模板不走静态路径", () => {
    const render = compile(`<input ref="inp" />`);
    const ctx = setupCtx();
    expect(() => ctx.host.appendChild(render(ctx))).not.toThrow();
    ctx.cleanup();
  });

  it("外层动态、内层静态子树仍能复用", () => {
    const count = useRef(0);
    // <span> 子树完全静态，可被提升
    const render = compile(`<div>{{ count }}<span class="static"><i>fixed</i></span></div>`);
    const ctx = setupCtx({ count });
    ctx.host.appendChild(render(ctx));
    expect(ctx.host.querySelector(".static i")?.textContent).toBe("fixed");
    count.value = 99;
    expect(ctx.host.querySelector("div")?.textContent).toContain("99");
    expect(ctx.host.querySelector(".static i")?.textContent).toBe("fixed");
    ctx.cleanup();
  });
});
