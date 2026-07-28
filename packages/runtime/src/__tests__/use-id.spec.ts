import { afterEach, describe, expect, it } from "vitest";

import { defineCustomElement } from "../element";
import { useId } from "../use-id";

let tagCounter = 0;
const nextTag = (): string => `elf-use-id-${++tagCounter}`;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useId", () => {
  it("returns stable unique ids for each setup call position", async () => {
    const tag = nextTag();
    const captures: string[][] = [];
    defineCustomElement({
      tag,
      setup: () => {
        captures.push([useId(), useId("field")]);
        return {};
      },
      render: () => document.createElement("div")
    });

    const first = document.createElement(tag);
    const second = document.createElement(tag);
    document.body.append(first, second);

    expect(captures).toHaveLength(2);
    expect(new Set(captures.flat()).size).toBe(4);
    expect(captures[0]?.[1]).toMatch(/^field-/u);

    const firstIds = captures[0];
    first.remove();
    await Promise.resolve();
    document.body.appendChild(first);

    expect(captures[2]).toEqual(firstIds);
  });

  it("rejects calls outside synchronous setup", () => {
    expect(() => useId()).toThrow("[useId]");
  });
});
