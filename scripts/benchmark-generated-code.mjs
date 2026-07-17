#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import { transform } from "esbuild";

globalThis.__DEV__ = false;

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const reportArg = args.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? resolve(root, reportArg.slice("--report=".length)) : null;
const asJson = args.includes("--json");
const quiet = args.includes("--check");

const [{ compileMacroComponent }, { createRenderState, extendRenderState, unwrapStateAccess }] =
  await Promise.all([
    import("../packages/compiler/dist/macro-component.js"),
    import("../packages/runtime/dist/internal.js")
  ]);

const fixtureSource = (index) => `
import { defineHtml, html, useRef } from "@elfui/core";

const count = useRef(${index});
const increment = (): void => count.set(count.peek() + 1);

export const GeneratedFixture${index} = defineHtml(html\`
  <article class="fixture">
    <h2>Fixture ${index}</h2>
    <button :aria-label=\${count} @click=\${increment}>\${count}</button>
    <p v-if="count >= 0">ready</p>
  </article>
\`);
`;

const result = compileMacroComponent(fixtureSource(0), {
  filename: "GeneratedFixture0.ts"
});
const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
if (errors.length > 0) {
  throw new Error(`generated fixture failed: ${errors.map((item) => item.message).join("; ")}`);
}
if (result.code.includes("...ctx.props")) {
  throw new Error("generated fixture recreated the props/state scope");
}
if (result.code.includes("const { count, increment }")) {
  throw new Error("generated bindings destructured setup fields they do not reference");
}
const minified = await transform(result.code, {
  format: "esm",
  legalComments: "none",
  loader: "ts",
  minify: true,
  target: "es2022"
});
const specializeFixture = (code, index) =>
  code
    .replaceAll("GeneratedFixture0", `GeneratedFixture${index}`)
    .replaceAll("generated-fixture-0", `generated-fixture-${index}`)
    .replaceAll("Fixture 0", `Fixture ${index}`);
const compiled = Array.from({ length: 100 }, (_, index) => ({
  code: specializeFixture(result.code, index),
  minified: specializeFixture(minified.code, index)
}));

const sizes = [1, 10, 100].map((count) => {
  const raw = compiled
    .slice(0, count)
    .map((fixture) => fixture.code)
    .join("\n");
  const minified = compiled
    .slice(0, count)
    .map((fixture) => fixture.minified)
    .join("\n");
  const bytes = Buffer.from(minified);
  return {
    components: count,
    raw: Buffer.byteLength(raw),
    min: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
    }).byteLength
  };
});

const rootState = createRenderState(
  { label: "prop" },
  { count: 1 },
  { $host: null, $emit: () => undefined }
);
const rootFacades = new Set();
for (let index = 0; index < 100_000; index++) {
  rootFacades.add(unwrapStateAccess(rootState));
}

const localFacades = new Set();
for (let item = 0; item < 1_000; item++) {
  const localState = extendRenderState(rootState, { item, index: item });
  for (let binding = 0; binding < 10; binding++) {
    localFacades.add(unwrapStateAccess(localState));
  }
}

const allocations = {
  rootBindingReads: 100_000,
  uniqueRootFacades: rootFacades.size,
  localBindingReads: 10_000,
  localScopes: 1_000,
  uniqueLocalFacades: localFacades.size
};

const hundredComponentSize = sizes.find((item) => item.components === 100);
if (
  !hundredComponentSize ||
  hundredComponentSize.min > 220 * 1024 ||
  hundredComponentSize.gzip > 3200 ||
  hundredComponentSize.brotli > 1400
) {
  throw new Error(
    `generated code size regression: ${JSON.stringify(hundredComponentSize ?? null)}`
  );
}

if (allocations.uniqueRootFacades !== 1 || allocations.uniqueLocalFacades !== 1_000) {
  throw new Error(`scope facade allocation regression: ${JSON.stringify(allocations)}`);
}

const formatBytes = (value) => `${(value / 1024).toFixed(2)} KB`;
const table = [
  "| Components | Raw | Min | Gzip | Brotli | Gzip / component |",
  "| ---: | ---: | ---: | ---: | ---: | ---: |",
  ...sizes.map(
    (row) =>
      `| ${row.components} | ${formatBytes(row.raw)} | ${formatBytes(row.min)} | ${formatBytes(row.gzip)} | ${formatBytes(row.brotli)} | ${(row.gzip / row.components).toFixed(1)} B |`
  )
].join("\n");

const report = `# ElfUI Generated Code Benchmark

> Generated on ${new Date().toISOString()}. Sizes cover compiler output only; runtime packages are excluded.

## Generated Code Size

${table}

## Scope Facade Allocation Signal

- Root scope: ${allocations.uniqueRootFacades} stable facade for ${allocations.rootBindingReads.toLocaleString("en-US")} binding reads.
- List locals: ${allocations.uniqueLocalFacades.toLocaleString("en-US")} stable facades for ${allocations.localScopes.toLocaleString("en-US")} local scopes and ${allocations.localBindingReads.toLocaleString("en-US")} binding reads.
`;

if (!asJson && !quiet) {
  console.log("\nElfUI generated code benchmark\n");
  console.log(table);
  console.log("");
  console.log(
    `root facade ${allocations.uniqueRootFacades}/${allocations.rootBindingReads} reads; local facades ${allocations.uniqueLocalFacades}/${allocations.localBindingReads} reads`
  );
}

if (reportPath) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
}

if (asJson) console.log(JSON.stringify({ sizes, allocations }, null, 2));
