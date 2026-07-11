// D 阶段 内置组件 验收测试
//
// 注意：teleport / dynamicComponent / keepAlive 首次挂载用 microtask 延迟，
// 给调用者时间把 anchor 插入 DOM。测试要 await tick。

import { afterEach, describe, expect, it } from "vitest";

import { useRef } from "@elfui/reactivity";

import { dynamicComponent, keepAlive, projectLightDom, teleport } from "../builtin";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("D1 Teleport", () => {
  it("把内容移动到目标容器", async () => {
    const target = document.createElement("div");
    target.id = "tgt";
    document.body.appendChild(target);
    const host = document.createElement("section");
    document.body.appendChild(host);

    const node = teleport("#tgt", false, () => {
      const p = document.createElement("p");
      p.textContent = "teleported";
      return p;
    });
    host.appendChild(node);
    await tick();

    expect(target.querySelector("p")?.textContent).toBe("teleported");
    expect(host.firstChild?.nodeType).toBe(8); // Comment
  });

  it("disabled=true 内容回到锚点位置", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const host = document.createElement("section");
    document.body.appendChild(host);

    const disabled = useRef(false);
    const node = teleport(
      target,
      () => disabled.value as boolean,
      () => {
        const p = document.createElement("p");
        p.textContent = "x";
        return p;
      }
    );
    host.appendChild(node);
    await tick();

    expect(target.querySelector("p")).toBeTruthy();
    disabled.value = true;
    expect(host.querySelector("p")?.textContent).toBe("x");
  });

  it("目标变化时移动节点", async () => {
    const a = document.createElement("div");
    a.id = "a";
    const b = document.createElement("div");
    b.id = "b";
    document.body.appendChild(a);
    document.body.appendChild(b);
    const host = document.createElement("section");
    document.body.appendChild(host);

    const tgt = useRef("#a");
    const node = teleport(
      () => tgt.value as string,
      false,
      () => {
        const p = document.createElement("p");
        p.textContent = "y";
        return p;
      }
    );
    host.appendChild(node);
    await tick();

    expect(a.querySelector("p")).toBeTruthy();
    tgt.value = "#b";
    expect(b.querySelector("p")?.textContent).toBe("y");
    expect(a.querySelector("p")).toBeNull();
  });

  it("projectLightDom 移动真实 light DOM 节点并可还原", () => {
    const host = document.createElement("elf-test");
    const body = document.createElement("div");
    const footer = document.createElement("footer");
    const button = document.createElement("button");
    const action = document.createElement("button");
    action.setAttribute("slot", "footer");
    let clicked = 0;
    action.addEventListener("click", () => {
      clicked++;
    });
    host.append(button, action);

    const projection = projectLightDom(host, {
      defaultTarget: body,
      slots: { footer }
    });

    expect(projection.project()).toBe(true);
    expect(projection.projected).toBe(true);
    expect(body.firstChild).toBe(button);
    expect(footer.firstChild).toBe(action);
    action.click();
    expect(clicked).toBe(1);

    projection.restore();
    expect(projection.projected).toBe(false);
    expect(host.childNodes[0]).toBe(button);
    expect(host.childNodes[1]).toBe(action);
  });
});

describe("D6 dynamicComponent", () => {
  it("string tag 切换", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);

    const tag = useRef("p");
    const node = dynamicComponent(
      () => tag.value as string,
      (el) => {
        el.textContent = "x";
      }
    );
    host.appendChild(node);
    await tick();

    expect(host.querySelector("p")?.textContent).toBe("x");
    tag.value = "span";
    expect(host.querySelector("p")).toBeNull();
    expect(host.querySelector("span")?.textContent).toBe("x");
  });

  it("null 表示不渲染", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);

    const tag = useRef<string | null>("p");
    const node = dynamicComponent(() => tag.value as string | null);
    host.appendChild(node);
    await tick();

    expect(host.querySelector("p")).toBeTruthy();
    tag.value = null;
    expect(host.querySelector("p")).toBeNull();
  });
});

describe("D4 keepAlive", () => {
  it("缓存元素实例", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);

    const created = new Map<string, number>();
    const key = useRef<string | undefined>("a");
    const node = keepAlive(
      () => key.value as string | undefined,
      (k) => {
        created.set(k, (created.get(k) ?? 0) + 1);
        const el = document.createElement("p");
        el.textContent = `comp-${k}`;
        return el;
      }
    );
    host.appendChild(node);
    await tick();

    expect(host.textContent).toContain("comp-a");
    expect(created.get("a")).toBe(1);

    key.value = "b";
    expect(host.textContent).toContain("comp-b");
    expect(host.textContent).not.toContain("comp-a");
    expect(created.get("b")).toBe(1);

    key.value = "a";
    expect(host.textContent).toContain("comp-a");
    expect(created.get("a")).toBe(1); // 缓存命中
  });

  it("max 限制 LRU 淘汰", async () => {
    const host = document.createElement("section");
    document.body.appendChild(host);

    const created: string[] = [];
    const key = useRef<string | undefined>("a");
    const node = keepAlive(
      () => key.value as string | undefined,
      (k) => {
        created.push(k);
        const el = document.createElement("p");
        el.textContent = k;
        return el;
      },
      { max: 2 }
    );
    host.appendChild(node);
    await tick();

    key.value = "b";
    key.value = "c"; // a 应被淘汰
    key.value = "a"; // 应该重新创建
    expect(created).toEqual(["a", "b", "c", "a"]);
  });
});
