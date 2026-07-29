import { describe, expect, it } from "vitest";

import { useRef } from "@elfui/reactivity";

import {
  createRenderState,
  extendRenderState,
  readTemplateValue,
  unwrapStateAccess,
  writeTemplateValue
} from "../unwrap";

describe("render state facade", () => {
  it("实时读取 props 并保持 setup > props > system 优先级", () => {
    const props = { label: "prop", value: "prop-value" };
    const setup = { value: "setup-value" };
    const system = { $host: "host", value: "system-value" };
    const state = createRenderState(props, setup, system);

    expect(state.label).toBe("prop");
    expect(state.value).toBe("setup-value");
    expect(state.$host).toBe("host");

    props.label = "updated";
    expect(state.label).toBe("updated");
  });

  it("同一个 raw state 始终复用同一个 unwrap facade", () => {
    const state = createRenderState({}, { count: useRef(1) }, {});
    const first = unwrapStateAccess(state);

    expect(unwrapStateAccess(state)).toBe(first);
    expect(first.count).toBe(1);
    first.count = 2;
    expect(first.count).toBe(2);
  });

  it("局部作用域覆盖同名父字段并透传其他读写", () => {
    const parent = createRenderState({}, { label: useRef("parent"), shared: useRef(1) }, {});
    const child = unwrapStateAccess(extendRenderState(parent, { label: useRef("child") }));

    expect(child.label).toBe("child");
    expect(child.shared).toBe(1);

    child.label = "local";
    child.shared = 2;

    expect(child.label).toBe("local");
    expect(unwrapStateAccess(parent).label).toBe("parent");
    expect(unwrapStateAccess(parent).shared).toBe(2);
  });
  it("preserves value properties on auto-unwrapped template locals", () => {
    const parent = createRenderState({}, { count: useRef(1) }, {});
    const item = useRef({ value: "local-value" });
    const child = extendRenderState(parent, { item });

    expect(readTemplateValue(parent, "count", 1)).toBe(1);
    expect(readTemplateValue(child, "item", item.value)).toBe("local-value");

    writeTemplateValue(child, "item", item.value, "updated");
    expect(item.value.value).toBe("updated");
  });
});
