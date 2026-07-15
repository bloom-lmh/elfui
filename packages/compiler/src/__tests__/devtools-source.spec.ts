import { describe, expect, it } from "vitest";

import { compileMacroComponent } from "../macro-component";

describe("macro component DevTools source metadata", () => {
  it("attaches normalized template source bounds to generated constructors", () => {
    const result = compileMacroComponent(
      `import { defineHtml, html } from "@elfui/core";\n\nexport const Card = defineHtml(html\`<article>{{ title }}</article>\`);`,
      { filename: "C:\\workspace\\src\\Card.elf.ts", templateTypeCheck: false }
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain(
      'Object.defineProperty(Card, "__elfSource", { value: {"file":"C:/workspace/src/Card.elf.ts"'
    );
    expect(result.code).toMatch(/"line":3,"column":\d+,"endLine":3,"endColumn":\d+/);
  });
});
