// `<template v-for>` 透明分组容器编译测试
//
// 修复：用 document.createElement("template") 会创建 HTMLTemplateElement，
// 子节点全部跑到 .content（DocumentFragment）里，DOM 树看不见。
// 改为：tag === "template" 时编译为 DocumentFragment。

import { useRef } from "@elfui/reactivity";
import { afterEach, describe, expect, it } from "vitest";

import { compile } from "../compile";

const renderToHost = (template: string, state: Record<string, unknown>): HTMLElement => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const fn = compile(template);
  const node = fn({
    state,
    props: {},
    emit: () => {},
    host,
    shadow: null
  });
  host.appendChild(node);
  return host;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("<template v-for> 透明分组", () => {
  it("template 内多元素全部渲染到外层", () => {
    const groups = useRef([
      { name: "Layout", items: ["A", "B"] },
      { name: "Basic", items: ["C"] }
    ]);
    const host = renderToHost(
      `<nav>
         <template v-for="g in groups" :key="g.name">
           <div class="group">{{ g.name }}</div>
           <span v-for="x in g.items" :key="x">{{ x }}</span>
         </template>
       </nav>`,
      { groups }
    );

    const nav = host.querySelector("nav")!;
    const headers = nav.querySelectorAll(".group");
    expect(headers.length).toBe(2);
    expect(headers[0]?.textContent).toBe("Layout");
    expect(headers[1]?.textContent).toBe("Basic");

    const items = nav.querySelectorAll("span");
    expect(items.length).toBe(3);
    expect(items[0]?.textContent).toBe("A");
    expect(items[2]?.textContent).toBe("C");
  });

  it("template 列表更新后子节点正确同步", async () => {
    const items = useRef(["x", "y"]);
    const host = renderToHost(
      `<div>
         <template v-for="i in items" :key="i">
           <p>{{ i }}</p>
         </template>
       </div>`,
      { items }
    );

    expect(host.querySelectorAll("p").length).toBe(2);

    items.set(["x", "y", "z"]);
    await Promise.resolve();
    expect(host.querySelectorAll("p").length).toBe(3);

    items.set(["only"]);
    await Promise.resolve();
    const p = host.querySelectorAll("p");
    expect(p.length).toBe(1);
    expect(p[0]?.textContent).toBe("only");
  });
});
