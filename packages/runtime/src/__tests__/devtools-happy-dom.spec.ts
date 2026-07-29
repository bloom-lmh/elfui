// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  attachDevtoolsTemplateNode,
  cloneDevtoolsTemplateTree,
  getDevtoolsTemplateNode
} from "../devtools";
import { defineCustomElement } from "../element";

describe("DevTools metadata in happy-dom", () => {
  it("renders a component containing a native select", () => {
    const tag = "elf-happy-dom-select-metadata";
    defineCustomElement({
      tag,
      render: () => {
        const select = document.createElement("select");
        const option = document.createElement("option");
        option.textContent = "Ready";
        select.append(option);
        attachDevtoolsTemplateNode(select, "src/HappySelect.ts", 2, 3, 4, 12);
        attachDevtoolsTemplateNode(option, "src/HappySelect.ts", 3, 5, 3, 28);
        return select;
      }
    });
    const host = document.createElement(tag);

    expect(() => document.body.append(host)).not.toThrow();
    expect(host.shadowRoot?.querySelector("select")?.textContent).toBe("Ready");
    host.remove();
  });

  it.each(["select", "input", "button", "option"] as const)(
    "attaches metadata to a native <%s> without interrupting rendering",
    (tag) => {
      const element = document.createElement(tag);

      expect(() =>
        attachDevtoolsTemplateNode(element, "src/NativeControls.ts", 3, 5, 3, 20)
      ).not.toThrow();
      expect(getDevtoolsTemplateNode(element)).toMatchObject({
        sourceId: "src/NativeControls.ts",
        templateNodeId: `src/NativeControls.ts:component:${tag}:3:5`,
        source: { file: "src/NativeControls.ts", line: 3, column: 5 }
      });
      if (tag === "select") {
        expect(() =>
          Object.getOwnPropertyDescriptor(element, Symbol.for("elfui.devtools.template-node"))
        ).toThrow(/Symbol value/u);
      }
    }
  );

  it("preserves WeakMap metadata when cloning a select tree", () => {
    const select = document.createElement("select");
    const option = document.createElement("option");
    select.append(option);
    attachDevtoolsTemplateNode(select, "src/Select.ts", 2, 1, 5, 10);
    attachDevtoolsTemplateNode(option, "src/Select.ts", 3, 3, 3, 18);

    const clone = cloneDevtoolsTemplateTree(select);

    expect(getDevtoolsTemplateNode(clone)?.templateNodeId).toBe(
      "src/Select.ts:component:select:2:1"
    );
    expect(getDevtoolsTemplateNode(clone.firstElementChild!)?.templateNodeId).toBe(
      "src/Select.ts:component:option:3:3"
    );
  });
});
