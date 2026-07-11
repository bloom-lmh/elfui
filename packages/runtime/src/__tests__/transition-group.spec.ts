// D3 TransitionGroup 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { useRef } from "@elfui/reactivity";

import { transitionGroup } from "../transition-group";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("D3 TransitionGroup", () => {
  it("初始渲染列表", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([1, 2, 3]);
    transitionGroup(
      host,
      () => items.value as readonly number[],
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n);
        return li;
      }
    );
    const lis = host.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe("1");
    expect(lis[2]?.textContent).toBe("3");
  });

  it("追加项触发 enter class", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([1, 2]);
    transitionGroup(
      host,
      () => items.value as readonly number[],
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n);
        return li;
      },
      { name: "fade" }
    );

    items.value.push(3);
    const lis = host.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    const last = lis[2] as HTMLElement;
    expect(last.classList.contains("fade-enter-from")).toBe(true);
    expect(last.classList.contains("fade-enter-active")).toBe(true);
  });

  it("删除项触发 leave class（保留在 DOM 直到动画结束）", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([1, 2, 3]);
    transitionGroup(
      host,
      () => items.value as readonly number[],
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n);
        return li;
      },
      { name: "fade" }
    );

    const before = Array.from(host.querySelectorAll("li"));
    items.value = [1, 3]; // 删除 2
    // 删除项还应该在 DOM 中（leave-active class）
    const allLis = host.querySelectorAll("li");
    const leaving = Array.from(allLis).find((li) => li.classList.contains("fade-leave-active"));
    expect(leaving?.textContent).toBe("2");
    expect(before.length).toBe(3);
  });

  it("重排不重新创建节点（key 复用）", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([
      { id: "a", name: "A" },
      { id: "b", name: "B" }
    ]);
    transitionGroup(
      host,
      () => items.value as readonly { id: string; name: string }[],
      (it) => it.id,
      (it) => {
        const li = document.createElement("li");
        li.textContent = it.name;
        return li;
      }
    );
    const before = Array.from(host.querySelectorAll("li"));
    items.value = [
      { id: "b", name: "B" },
      { id: "a", name: "A" }
    ];
    const after = Array.from(host.querySelectorAll("li"));
    // 节点身份保留
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it("css: false 不添加 class", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([1]);
    transitionGroup(
      host,
      () => items.value as readonly number[],
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n);
        return li;
      },
      { name: "fade", css: false }
    );

    items.value.push(2);
    const lis = host.querySelectorAll("li");
    const last = lis[1] as HTMLElement;
    expect(last.classList.contains("fade-enter-from")).toBe(false);
  });

  it("自定义 moveClass", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([
      { id: "a", v: 1 },
      { id: "b", v: 2 }
    ]);
    transitionGroup(
      host,
      () => items.value as readonly { id: string; v: number }[],
      (it) => it.id,
      (it) => {
        const li = document.createElement("li");
        li.textContent = String(it.v);
        return li;
      },
      { name: "fade", moveClass: "my-move" }
    );
    // 简单验证 options 接受 moveClass
    expect(host.querySelectorAll("li")).toHaveLength(2);
  });
});
