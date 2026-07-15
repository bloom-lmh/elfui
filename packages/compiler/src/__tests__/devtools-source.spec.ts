import { describe, expect, it } from "vitest";

import { compileMacroComponent } from "../macro-component";
import { createStableSourceId, elfuiMacroPlugin } from "../vite";

const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const decodeVlq = (segment: string): number[] => {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const character of segment) {
    const digit = base64.indexOf(character);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    const negative = value & 1;
    values.push((value >> 1) * (negative ? -1 : 1));
    value = 0;
    shift = 0;
  }
  return values;
};

const originalPositionFor = (
  mappings: string,
  generatedLine: number
): { line: number; column: number } | null => {
  let originalLine = 0;
  let originalColumn = 0;
  const lines = mappings.split(";");
  for (let index = 0; index < generatedLine; index++) {
    const segment = lines[index]?.split(",")[0];
    if (!segment) continue;
    const values = decodeVlq(segment);
    originalLine += values[2] ?? 0;
    originalColumn += values[3] ?? 0;
    if (index === generatedLine - 1) {
      return { line: originalLine + 1, column: originalColumn };
    }
  }
  return null;
};

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

  it("uses a stable sourceId in component metadata and precise source maps", () => {
    const result = compileMacroComponent(
      `import { defineHtml, html } from "@elfui/core";\n\nexport const Card = defineHtml(html\`<article>{{ title }}</article>\`);`,
      {
        filename: "C:\\workspace\\src\\Card.elf.ts?direct",
        sourceId: "src/Card.elf.ts",
        templateTypeCheck: false
      }
    );
    const generatedLines = result.code.split(/\r?\n/u);
    const sourceMetadataLine =
      generatedLines.findIndex((line) => line.includes('"__elfSource"')) + 1;
    const sourceMetadata = /value: (\{[^}]+\})/u.exec(generatedLines[sourceMetadataLine - 1] ?? "");
    const bindingMetadataLine =
      generatedLines.findIndex((line) => /source:\s*\{\s*line:/u.test(line)) + 1;
    const bindingMetadata = /source:\s*\{\s*line:\s*(\d+),\s*column:\s*(\d+)/u.exec(
      generatedLines[bindingMetadataLine - 1] ?? ""
    );
    const location = JSON.parse(sourceMetadata?.[1] ?? "{}") as {
      file: string;
      line: number;
      column: number;
    };

    expect(result.metadata.sourceId).toBe("src/Card.elf.ts");
    expect(result.map.file).toBe("src/Card.elf.ts");
    expect(result.map.sources).toEqual(["src/Card.elf.ts"]);
    expect(location.file).toBe("src/Card.elf.ts");
    expect(originalPositionFor(result.map.mappings, sourceMetadataLine)).toEqual({
      line: location.line,
      column: location.column - 1
    });
    expect(bindingMetadataLine).toBeGreaterThan(0);
    expect(originalPositionFor(result.map.mappings, bindingMetadataLine)).toEqual({
      line: location.line + Number(bindingMetadata?.[1] ?? 1) - 1,
      column: location.column - 1 + Number(bindingMetadata?.[2] ?? 1) - 1
    });
  });

  it("creates identical project-relative IDs for Windows and POSIX paths", () => {
    expect(createStableSourceId("C:\\workspace\\src\\Card.elf.ts?direct", "C:\\workspace")).toBe(
      "src/Card.elf.ts"
    );
    expect(createStableSourceId("/workspace/src/Card.elf.ts?direct", "/workspace")).toBe(
      "src/Card.elf.ts"
    );
  });

  it("passes the Vite project-relative sourceId into macro compilation", () => {
    const plugin = elfuiMacroPlugin();
    plugin.configResolved?.({ root: "C:\\workspace" });
    const result = plugin.transform?.(
      `import { defineHtml, html } from "@elfui/core";\nexport const Card = defineHtml(html\`<p>card</p>\`);`,
      "C:\\workspace\\src\\Card.elf.ts?direct"
    );

    expect(result?.map?.sources).toEqual(["src/Card.elf.ts"]);
    expect(result?.code).toContain('"file":"src/Card.elf.ts"');
  });
});
