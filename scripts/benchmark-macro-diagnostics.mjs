import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { compileMacroComponent } from "../packages/compiler/dist/macro-component.js";

const root = path.resolve(import.meta.dirname, "..");
const kitRoot = path.resolve(process.env.ELFUI_KIT_ROOT ?? path.join(root, "..", "elfui-kit"));
const componentRoot = path.join(kitRoot, "src", "components");

if (!existsSync(componentRoot)) {
  throw new Error(`ElfUI Kit component root not found: ${componentRoot}`);
}

const fileFilter = process.env.ELFUI_MACRO_DIAGNOSTICS_BENCH_FILTER
  ? new RegExp(process.env.ELFUI_MACRO_DIAGNOSTICS_BENCH_FILTER, "i")
  : null;
const files = collectMacroComponentFiles(componentRoot).filter(
  (fileName) =>
    !fileFilter || fileFilter.test(path.relative(componentRoot, fileName).replace(/\\/g, "/"))
);
const passCount = Math.max(
  1,
  Number.parseInt(process.env.ELFUI_MACRO_DIAGNOSTICS_BENCH_PASSES ?? "2", 10)
);
const passes = Array.from({ length: passCount }, (_, index) =>
  runPass(index === 0 ? "cold" : `repeat-${index}`)
);
const report = {
  files: files.length,
  generatedAt: new Date().toISOString(),
  passes
};
const outputDirectory = path.join(root, "output");
const outputPath = path.join(outputDirectory, "macro-diagnostics-performance.json");

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`ElfUI macro diagnostics benchmark: ${files.length} files`);
for (const pass of passes) {
  console.log(`  ${pass.name}: ${pass.durationMs.toFixed(1)}ms, ${pass.diagnostics} diagnostics`);
}
console.log(`Report: ${outputPath}`);

function runPass(name) {
  const started = performance.now();
  let diagnostics = 0;
  const diagnosticFiles = [];
  const results = [];

  for (const fileName of files) {
    const source = readFileSync(fileName, "utf8");
    const fileStarted = performance.now();
    const result = compileMacroComponent(source, {
      filename: fileName,
      sourceId: pathToFileURL(fileName).toString(),
      templateTypeCheck: true
    });
    const durationMs = performance.now() - fileStarted;

    diagnostics += result.diagnostics.length;
    results.push({
      diagnostics: result.diagnostics.length,
      durationMs,
      file: path.relative(componentRoot, fileName).replace(/\\/g, "/")
    });
    if (result.diagnostics.length > 0) {
      diagnosticFiles.push({
        codes: result.diagnostics.map((diagnostic) => diagnostic.code),
        file: path.relative(componentRoot, fileName).replace(/\\/g, "/")
      });
    }
  }

  return {
    diagnosticFiles,
    diagnostics,
    durationMs: performance.now() - started,
    name,
    slowest: [...results].sort((left, right) => right.durationMs - left.durationMs).slice(0, 12)
  };
}

function collectMacroComponentFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      return entry.isDirectory()
        ? collectMacroComponentFiles(entryPath)
        : entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)
          ? [entryPath]
          : [];
    })
    .filter((fileName) => readFileSync(fileName, "utf8").includes("defineHtml"))
    .sort();
}
