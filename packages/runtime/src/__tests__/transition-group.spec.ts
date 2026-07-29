// D3 TransitionGroup 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { effectScope, useEffect, useRef } from "@elfui/reactivity";

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
        li.textContent = String(n.value);
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
        li.textContent = String(n.value);
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
        li.textContent = String(n.value);
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
        li.textContent = it.value.name;
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
        li.textContent = String(n.value);
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
        li.textContent = String(it.value.v);
        return li;
      },
      { name: "fade", moveClass: "my-move" }
    );
    // 简单验证 options 接受 moveClass
    expect(host.querySelectorAll("li")).toHaveLength(2);
  });

  it("稳定 key 更新 item 和 index 时复用节点并批量刷新", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const items = useRef([
      { id: "a", label: "A" },
      { id: "b", label: "B" }
    ]);
    let runs = 0;
    transitionGroup(
      host,
      () => items.value,
      (item) => item.id,
      (item, index) => {
        const li = document.createElement("li");
        useEffect(() => {
          runs++;
          li.textContent = `${index.value}:${item.value.label}`;
        });
        return li;
      },
      { css: false }
    );
    const before = Array.from(host.children);
    const initialRuns = runs;

    items.value = [
      { id: "b", label: "B2" },
      { id: "a", label: "A2" }
    ];

    expect(Array.from(host.children)).toEqual([before[1], before[0]]);
    expect(host.textContent).toBe("0:B21:A2");
    expect(runs - initialRuns).toBe(2);
  });

  it("owner scope 停止时清理节点和 item effect", () => {
    const host = document.createElement("ul");
    document.body.appendChild(host);
    const owner = effectScope();
    const items = useRef([{ id: "a", label: "A" }]);
    let runs = 0;
    owner.run(() => {
      transitionGroup(
        host,
        () => items.value,
        (item) => item.id,
        (item) => {
          const li = document.createElement("li");
          useEffect(() => {
            runs++;
            li.textContent = item.value.label;
          });
          return li;
        },
        { css: false }
      );
    });
    expect(host.textContent).toBe("A");

    owner.stop();
    const stoppedRuns = runs;
    expect(host.children).toHaveLength(0);
    items.value = [{ id: "a", label: "B" }];
    expect(runs).toBe(stoppedRuns);
  });
});
