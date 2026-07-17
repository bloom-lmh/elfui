// B2.1 v-if / v-else-if / v-else 多分支验收

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
    emit: () => true,
    host,
    shadow: null
  });
  host.appendChild(node);
  return host;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("v-if / v-else-if / v-else 多分支", () => {
  it("v-if true 时只渲染第一支", () => {
    const cond = useRef(true);
    const host = renderToHost(`<div><span v-if="cond">A</span><span v-else>B</span></div>`, {
      cond
    });
    expect(host.querySelector("div")?.textContent).toBe("A");
  });

  it("v-if false 时渲染 v-else", () => {
    const cond = useRef(false);
    const host = renderToHost(`<div><span v-if="cond">A</span><span v-else>B</span></div>`, {
      cond
    });
    expect(host.querySelector("div")?.textContent).toBe("B");
  });

  it("三分支 v-if / v-else-if / v-else 切换", async () => {
    const n = useRef(1);
    const host = renderToHost(
      `<div><span v-if="n === 1">A</span><span v-else-if="n === 2">B</span><span v-else>C</span></div>`,
      { n }
    );
    expect(host.querySelector("div")?.textContent).toBe("A");

    n.set(2);
    await Promise.resolve();
    expect(host.querySelector("div")?.textContent).toBe("B");

    n.set(3);
    await Promise.resolve();
    expect(host.querySelector("div")?.textContent).toBe("C");
  });

  it("无 v-else 兜底，所有条件都 false 时不渲染", async () => {
    const n = useRef(0);
    const host = renderToHost(
      `<div><span v-if="n === 1">A</span><span v-else-if="n === 2">B</span></div>`,
      { n }
    );
    expect(host.querySelector("div")?.textContent?.trim()).toBe("");
  });

  it("根级（多根节点）也支持 v-if 链", () => {
    const cond = useRef(false);
    const host = renderToHost(`<span v-if="cond">A</span><span v-else>B</span>`, { cond });
    expect(host.textContent).toBe("B");
  });
});
