import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compileMacroComponent } from "../macro-component";

const fixtureRoot = mkdtempSync(path.join(tmpdir(), "elfui-template-diagnostics-"));

afterAll(() => {
  rmSync(fixtureRoot, { force: true, recursive: true });
});

const createSource = (expression: string, importPath?: string) => `
import { defineHtml, defineProps } from "@elfui/core";
${importPath ? `import ${JSON.stringify(importPath)};` : ""}
const props = defineProps<{ count: number }>();
export const Demo = defineHtml(\`<p>\${${expression}}</p>\`);
`;

const readTemplateTypeMessages = (source: string, filename: string) =>
  compileMacroComponent(source, { filename, templateTypeCheck: true })
    .diagnostics.filter((diagnostic) => diagnostic.code === "ELF_TEMPLATE_TYPE")
    .map((diagnostic) => diagnostic.message);

describe("macro template diagnostics", () => {
  it("keeps current-template diagnostics fresh across same-file edits", () => {
    const filename = path.join(fixtureRoot, "EditProbe.ts");

    expect(readTemplateTypeMessages(createSource("props.missing"), filename)).toEqual([
      expect.stringContaining("Property 'missing' does not exist")
    ]);
    expect(readTemplateTypeMessages(createSource("props.count"), filename)).toEqual([]);
    expect(readTemplateTypeMessages(createSource("props.missing"), filename)).toEqual([
      expect.stringContaining("Property 'missing' does not exist")
    ]);
  });

  it("does not project imported-file diagnostics onto matching template lines", () => {
    const dependencyPath = path.join(fixtureRoot, "broken.ts");
    const filename = path.join(fixtureRoot, "ImportedDiagnosticProbe.ts");

    writeFileSync(
      dependencyPath,
      Array.from(
        { length: 120 },
        (_, index) => `export const broken${index}: string = ${index};`
      ).join("\n")
    );

    expect(readTemplateTypeMessages(createSource("props.count", "./broken"), filename)).toEqual([]);
    expect(readTemplateTypeMessages(createSource("props.missing", "./broken"), filename)).toEqual([
      expect.stringContaining("Property 'missing' does not exist")
    ]);
  }, 15_000);

  it("isolates reusable programs by macro import and survives bounded-cache eviction", () => {
    for (let index = 0; index < 6; index++) {
      const macroImport = `@test/elfui-macro-${index}`;
      const source = createSource("props.count").replaceAll("@elfui/core", macroImport);
      const result = compileMacroComponent(source, {
        filename: path.join(fixtureRoot, `MacroImport${index}.ts`),
        macroImport,
        templateTypeCheck: true
      });

      expect(result.diagnostics.filter((item) => item.code === "ELF_TEMPLATE_TYPE")).toEqual([]);
    }

    expect(
      readTemplateTypeMessages(
        createSource("props.missing"),
        path.join(fixtureRoot, "AfterEviction.ts")
      )
    ).toEqual([expect.stringContaining("Property 'missing' does not exist")]);
  }, 15_000);
});
