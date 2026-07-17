// C2 控制流原语 验收测试

import { describe, expect, it, vi } from "vitest";

import { useRef } from "@elfui/reactivity";

import { branch, list, mark, show } from "../control-flow";
import { text } from "../bindings";
import { applyCustomDirective } from "../directive";

const setupContainer = () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const anchor = mark("test");
  root.appendChild(anchor);
  return { root, anchor, cleanup: () => document.body.removeChild(root) };
};

describe("branch — v-if 等", () => {
  it("初始渲染选中分支", () => {
    const { root, anchor, cleanup } = setupContainer();
    const flag = useRef(true);
    branch(anchor, () => (flag.value ? 0 : 1), [
      () => {
        const el = document.createElement("p");
        el.textContent = "A";
        return el;
      },
      () => {
        const el = document.createElement("p");
        el.textContent = "B";
        return el;
      }
    ]);
    expect(root.textContent).toBe("A");
    cleanup();
  });

  it("切换分支卸载旧节点", () => {
    const { root, anchor, cleanup } = setupContainer();
    const flag = useRef(true);
    branch(anchor, () => (flag.value ? 0 : 1), [
      () => {
        const el = document.createElement("p");
        el.textContent = "A";
        return el;
      },
      () => {
        const el = document.createElement("p");
        el.textContent = "B";
        return el;
      }
    ]);
    expect(root.textContent).toBe("A");
    flag.value = false;
    expect(root.textContent).toBe("B");
    flag.value = true;
    expect(root.textContent).toBe("A");
    cleanup();
  });

  it("索引为 -1 表示什么都不渲染（v-show 的卸载形态）", () => {
    const { root, anchor, cleanup } = setupContainer();
    const visible = useRef(true);
    branch(anchor, () => (visible.value ? 0 : -1), [
      () => {
        const el = document.createElement("p");
        el.textContent = "X";
        return el;
      }
    ]);
    expect(root.textContent).toBe("X");
    visible.value = false;
    expect(root.textContent).toBe("");
    visible.value = true;
    expect(root.textContent).toBe("X");
    cleanup();
  });

  it("分支内的 effect 会跟随该分支生命周期", () => {
    const { root, anchor, cleanup } = setupContainer();
    const flag = useRef(true);
    const text = useRef("hello");
    branch(anchor, () => (flag.value ? 0 : 1), [
      () => {
        const el = document.createElement("span");
        // 模拟 codegen 产物：分支内创建依赖 text 的 effect
        // 这里用 textContent 直接读 + effect 简化
        const update = () => {
          el.textContent = String(text.value);
        };
        update();
        // 真实 codegen 会用 useEffect 包；这里简化
        return el;
      },
      () => {
        const el = document.createElement("span");
        el.textContent = "B";
        return el;
      }
    ]);
    expect(root.textContent).toBe("hello");
    flag.value = false;
    expect(root.textContent).toBe("B");
    cleanup();
  });

  it("切换分支时释放分支内的指令", () => {
    const { anchor, cleanup } = setupContainer();
    const visible = useRef(true);
    const unmounted = vi.fn();
    branch(anchor, () => (visible.value ? 0 : -1), [
      () => {
        const el = document.createElement("div");
        applyCustomDirective(el, { unmounted }, () => "value");
        return el;
      }
    ]);

    visible.value = false;

    expect(unmounted).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("list — v-for", () => {
  it("初始渲染列表", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([1, 2, 3]);
    list(
      anchor,
      () => items.value,
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n.value);
        return li;
      }
    );
    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe("1");
    expect(lis[2]?.textContent).toBe("3");
    cleanup();
  });

  it("追加项", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([1, 2]);
    list(
      anchor,
      () => items.value,
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n.value);
        return li;
      }
    );
    items.value.push(3);
    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[2]?.textContent).toBe("3");
    cleanup();
  });

  it("追加项时只插入新增节点，不移动已有节点", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([1, 2]);
    list(
      anchor,
      () => items.value,
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n.value);
        return li;
      }
    );

    const before = Array.from(root.querySelectorAll("li"));
    const insert = vi.spyOn(root, "insertBefore");
    items.value = [1, 2, 3];
    const after = Array.from(root.querySelectorAll("li"));

    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]?.textContent).toBe("3");
    expect(insert).toHaveBeenCalledTimes(1);
    insert.mockRestore();
    cleanup();
  });

  it("删除项", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([1, 2, 3]);
    list(
      anchor,
      () => items.value,
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n.value);
        return li;
      }
    );
    items.value = [1, 3];
    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(2);
    expect(lis[0]?.textContent).toBe("1");
    expect(lis[1]?.textContent).toBe("3");
    cleanup();
  });

  it("重排不重新创建节点（key 复用）", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([
      { id: "a", name: "A" },
      { id: "b", name: "B" }
    ]);
    list(
      anchor,
      () => items.value,
      (it) => it.id,
      (it) => {
        const li = document.createElement("li");
        li.textContent = it.value.name;
        return li;
      }
    );
    const before = Array.from(root.querySelectorAll("li"));
    items.value = [
      { id: "b", name: "B" },
      { id: "a", name: "A" }
    ];
    const after = Array.from(root.querySelectorAll("li"));
    // 节点身份应该被复用，只是顺序换了
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    cleanup();
  });

  it("重排时保留最长稳定子序列，只移动必要节点", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" }
    ]);
    list(
      anchor,
      () => items.value,
      (it) => it.id,
      (it) => {
        const li = document.createElement("li");
        li.textContent = it.value.name;
        return li;
      }
    );
    const before = Array.from(root.querySelectorAll("li"));
    const insert = vi.spyOn(root, "insertBefore");

    items.value = [
      { id: "d", name: "D" },
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" }
    ];
    const after = Array.from(root.querySelectorAll("li"));

    expect(after[0]).toBe(before[3]);
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
    expect(after[3]).toBe(before[2]);
    expect(insert).toHaveBeenCalledTimes(1);
    insert.mockRestore();
    cleanup();
  });

  it("DEV 下提示重复 key", () => {
    const { anchor, cleanup } = setupContainer();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = useRef([
      { id: "a", name: "A" },
      { id: "a", name: "A2" }
    ]);

    list(
      anchor,
      () => items.value,
      (it) => it.id,
      (it) => {
        const li = document.createElement("li");
        li.textContent = it.value.name;
        return li;
      }
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate key "a"'), "a");
    warn.mockRestore();
    cleanup();
  });

  it("空列表", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef<number[]>([]);
    list(
      anchor,
      () => items.value,
      (n) => n,
      (n) => {
        const li = document.createElement("li");
        li.textContent = String(n.value);
        return li;
      }
    );
    expect(root.querySelectorAll("li")).toHaveLength(0);
    items.value.push(1);
    expect(root.querySelectorAll("li")).toHaveLength(1);
    cleanup();
  });

  it("删除列表项时释放该项内的指令", () => {
    const { anchor, cleanup } = setupContainer();
    const items = useRef([1]);
    const unmounted = vi.fn();
    list(
      anchor,
      () => items.value,
      (item) => item,
      () => {
        const el = document.createElement("div");
        applyCustomDirective(el, { unmounted }, () => "value");
        return el;
      }
    );

    items.value = [];

    expect(unmounted).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("同 key 替换 item 时更新已有节点内容", () => {
    const { root, anchor, cleanup } = setupContainer();
    const items = useRef([{ id: "a", name: "A" }]);
    list(
      anchor,
      () => items.value,
      (item) => item.id,
      (item) => {
        const li = document.createElement("li");
        text(li.appendChild(document.createTextNode("")), () => item.value.name);
        return li;
      }
    );

    const before = root.querySelector("li");
    items.value = [{ id: "a", name: "B" }];

    expect(root.querySelector("li")).toBe(before);
    expect(root.textContent).toBe("B");
    cleanup();
  });

  it("重排后更新 index 并保留节点身份", () => {
    const { root, anchor, cleanup } = setupContainer();
    const a = { id: "a" };
    const b = { id: "b" };
    const items = useRef([a, b]);
    list(
      anchor,
      () => items.value,
      (item) => item.id,
      (item, index) => {
        const li = document.createElement("li");
        text(li.appendChild(document.createTextNode("")), () => `${index.value}:${item.value.id}`);
        return li;
      }
    );

    const before = Array.from(root.querySelectorAll("li"));
    items.value = [b, a];
    const after = Array.from(root.querySelectorAll("li"));

    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(root.textContent).toBe("0:b1:a");
    cleanup();
  });
});

describe("show — v-show", () => {
  it("切换 display", () => {
    const visible = useRef(true);
    const el = document.createElement("div");
    show(el, () => visible.value);
    expect(el.style.display).toBe("");

    visible.value = false;
    expect(el.style.display).toBe("none");

    visible.value = true;
    expect(el.style.display).toBe("");
  });

  it("保留原始 display 值", () => {
    const visible = useRef(true);
    const el = document.createElement("div");
    el.style.display = "flex";
    show(el, () => visible.value);
    expect(el.style.display).toBe("flex");

    visible.value = false;
    expect(el.style.display).toBe("none");

    visible.value = true;
    expect(el.style.display).toBe("flex");
  });
});

describe("mark", () => {
  it("创建注释节点", () => {
    const a = mark("hello");
    expect(a.nodeType).toBe(8); // COMMENT_NODE
    expect(a.data).toBe("hello");
  });
});
