// B5.4 动态参数 :[key] / @[event]

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

describe("动态参数", () => {
  it(":[key] 把值绑到动态属性名", async () => {
    const key = useRef("title");
    const val = useRef("hello");
    const host = renderToHost(`<div :[key]="val">x</div>`, { key, val });
    const div = host.querySelector("div")!;
    expect(div.getAttribute("title")).toBe("hello");

    key.set("data-x");
    await Promise.resolve();
    expect(div.getAttribute("title")).toBeNull();
    expect(div.getAttribute("data-x")).toBe("hello");
  });

  it("@[event] 绑定动态事件名", () => {
    const evName = useRef("click");
    let calls = 0;
    const handler = (): void => {
      calls++;
    };
    const host = renderToHost(`<button @[evName]="handler">x</button>`, {
      evName,
      handler
    });
    const btn = host.querySelector("button")!;
    btn.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
  });
});
