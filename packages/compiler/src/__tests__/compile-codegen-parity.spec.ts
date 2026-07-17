import { afterEach, describe, expect, it } from "vitest";

import { useReactive, useRef } from "@elfui/reactivity";
import type { RenderContext } from "@elfui/runtime";
import * as runtimeInternal from "@elfui/runtime/internal";

import { codegen } from "../codegen";
import { compile } from "../compile";

type StateFixture = {
  state: Record<string, unknown>;
};

type DomSnapshot =
  | string
  | {
      tag: string;
      attributes: [string, string][];
      children: DomSnapshot[];
    };

const evalGeneratedCode = (template: string): ((ctx: RenderContext) => Node) => {
  const { code, helpers } = codegen(template);
  const importLine = helpers.length ? `const { ${helpers.join(", ")} } = __runtime;` : "";
  const executable = code
    .replace(/import\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?/, importLine)
    .replace(/export default function/, "return function");
  const factory = new Function("__runtime", executable);
  return factory(runtimeInternal) as (ctx: RenderContext) => Node;
};

const makeContext = (host: HTMLElement, state: Record<string, unknown>) => ({
  state,
  props: {},
  emit: () => true,
  host,
  shadow: null
});

const snapshotChildren = (parent: Node): DomSnapshot[] =>
  Array.from(parent.childNodes).flatMap((node): DomSnapshot[] => {
    if (node.nodeType === Node.COMMENT_NODE) return [];
    if (node.nodeType === Node.TEXT_NODE) return [node.textContent ?? ""];
    if (!(node instanceof Element)) return [];

    const attributes = Array.from(
      node.attributes,
      ({ name, value }) => [name, value] as [string, string]
    ).sort(([left], [right]) => left.localeCompare(right));
    return [
      {
        tag: node.tagName.toLowerCase(),
        attributes,
        children: snapshotChildren(node)
      }
    ];
  });

const mountBoth = <T extends StateFixture>(template: string, createFixture: () => T) => {
  const runtimeHost = document.createElement("div");
  const generatedHost = document.createElement("div");
  document.body.append(runtimeHost, generatedHost);

  const runtime = createFixture();
  const generated = createFixture();
  runtimeHost.appendChild(compile(template)(makeContext(runtimeHost, runtime.state)));
  generatedHost.appendChild(
    evalGeneratedCode(template)(makeContext(generatedHost, generated.state))
  );

  return { runtimeHost, generatedHost, runtime, generated };
};

const expectSameDom = (runtimeHost: HTMLElement, generatedHost: HTMLElement): void => {
  expect(snapshotChildren(generatedHost)).toEqual(snapshotChildren(runtimeHost));
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("runtime compile / offline codegen parity", () => {
  it("保持插值与动态属性的初始和更新语义一致", async () => {
    const createFixture = () => {
      const count = useRef(1);
      const label = useRef("ready");
      const enabled = useRef(true);
      const item = useReactive({ value: "plain-value" });
      const user = useReactive<{ profile?: { name: string } }>({ profile: { name: "Ada" } });
      return {
        state: { count, label, enabled, item, user },
        count,
        label,
        enabled,
        item,
        user
      };
    };
    const pair = mountBoth(
      `<section :data-count="count + 1" :title="label" :class="{ active: enabled }">
        <p>{{ label.toUpperCase() }}</p>
        <p>{{ user?.profile?.name ?? "anonymous" }}</p>
        <p>{{ item.value }}|{{ \`count: }} ${"${count}"}\` }}</p>
      </section>`,
      createFixture
    );

    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("section")?.getAttribute("data-count")).toBe("2");
    expect(pair.runtimeHost.textContent).toContain("READY");
    expect(pair.runtimeHost.textContent).toContain("plain-value|count: }} 1");

    for (const fixture of [pair.runtime, pair.generated]) {
      fixture.count.value = 3;
      fixture.label.value = "updated";
      fixture.enabled.value = false;
      fixture.item.value = "next-value";
      delete fixture.user.profile;
    }
    await Promise.resolve();

    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("section")?.getAttribute("data-count")).toBe("4");
    expect(pair.runtimeHost.querySelector("section")?.classList.contains("active")).toBe(false);
    expect(pair.runtimeHost.textContent).toContain("anonymous");
    expect(pair.runtimeHost.textContent).toContain("next-value|count: }} 3");
  });

  it("保持 v-for 局部表达式的求值语义一致", async () => {
    const createFixture = () => {
      const items = useRef([
        { id: 1, label: "A" },
        { id: 2, label: "B" }
      ]);
      return { state: { items }, items };
    };
    const pair = mountBoth(
      '<ul><li v-for="(item, index) in items" :data-id="item.id">{{ index }}:{{ item.label ?? "missing" }}</li></ul>',
      createFixture
    );

    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("ul")?.textContent).toBe("0:A1:B");

    for (const fixture of [pair.runtime, pair.generated]) {
      fixture.items.value = [
        { id: 2, label: "B2" },
        { id: 3, label: "C" }
      ];
    }
    await Promise.resolve();

    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("ul")?.textContent).toBe("0:B21:C");
  });

  it("保持事件表达式的读取、赋值和批处理结果一致", async () => {
    const createFixture = () => {
      const count = useRef(1);
      const item = useReactive({ value: "before" });
      return {
        state: { count, item, step: 2, nextLabel: "after" },
        count,
        item
      };
    };
    const pair = mountBoth(
      '<button @click="count.value = count.value + step, item.value = nextLabel">{{ count }}|{{ item.value }}</button>',
      createFixture
    );

    pair.runtimeHost.querySelector("button")?.dispatchEvent(new Event("click"));
    pair.generatedHost.querySelector("button")?.dispatchEvent(new Event("click"));
    await Promise.resolve();

    expect(pair.runtime.count.value).toBe(3);
    expect(pair.generated.count.value).toBe(3);
    expect(pair.runtime.item.value).toBe("after");
    expect(pair.generated.item.value).toBe("after");
    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("button")?.textContent).toBe("3|after");
  });

  it("保持 v-model 对 Ref 与普通 value 字段的写入语义一致", async () => {
    const createFixture = () => {
      const text = useRef("ref-before");
      const record = useReactive({ value: "field-before" });
      return { state: { text, record }, text, record };
    };
    const pair = mountBoth(
      '<div><input class="ref" v-model="text.value" /><input class="field" v-model="record.value" /><output>{{ text }}|{{ record.value }}</output></div>',
      createFixture
    );

    for (const host of [pair.runtimeHost, pair.generatedHost]) {
      const refInput = host.querySelector(".ref") as HTMLInputElement;
      const fieldInput = host.querySelector(".field") as HTMLInputElement;
      refInput.value = "ref-after";
      fieldInput.value = "field-after";
      refInput.dispatchEvent(new Event("input"));
      fieldInput.dispatchEvent(new Event("input"));
    }
    await Promise.resolve();

    expect(pair.runtime.text.value).toBe("ref-after");
    expect(pair.generated.text.value).toBe("ref-after");
    expect(pair.runtime.record.value).toBe("field-after");
    expect(pair.generated.record.value).toBe("field-after");
    expectSameDom(pair.runtimeHost, pair.generatedHost);
    expect(pair.runtimeHost.querySelector("output")?.textContent).toBe("ref-after|field-after");
  });
});
