import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const compilerEntry = path.join(repoRoot, "packages", "compiler", "dist", "macro-component.js");
const roots = ["packages", "website"];
if (process.argv.includes("--include-ui-kit")) {
  roots.push("ui-kit/src");
}
const ignoredDirs = new Set([
  ".vitepress",
  "coverage",
  "dist",
  "node_modules",
  "__tests__",
  "fixtures"
]);
const ignoredFilePattern = /\.(?:spec|test)\.tsx?$/u;
const macroFilePattern = /\.elf\.tsx?$/u;
const tsFilePattern = /\.tsx?$/u;
const componentPragmaPattern = /^\s*\/\/\/\s*<!--\s*@elf component\s*-->/mu;
const macroImportPattern = /import\s*\{[^}]*\bdefineHtml\b[^}]*\}\s*from\s*["']@elfui\/core["']/u;

const toRelative = (file) => path.relative(repoRoot, file).replace(/\\/g, "/");

const walk = (dir, out) => {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(fullPath, out);
      continue;
    }
    if (!entry.isFile() || !tsFilePattern.test(entry.name) || ignoredFilePattern.test(entry.name)) {
      continue;
    }
    out.push(fullPath);
  }
};

const isMacroComponentFile = (file, source) => {
  if (macroFilePattern.test(file)) return true;
  if (componentPragmaPattern.test(source)) return true;
  return macroImportPattern.test(source) && /\bdefineHtml(?:<[^>]+>)?\s*\(/u.test(source);
};

const collectMacroFiles = () => {
  const files = [];
  for (const root of roots) walk(path.join(repoRoot, root), files);
  return files
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ file, source }) => isMacroComponentFile(file, source))
    .sort((a, b) => toRelative(a.file).localeCompare(toRelative(b.file)));
};

if (!existsSync(compilerEntry)) {
  console.error("Missing compiler dist entry. Run `pnpm build` before `pnpm typecheck:template`.");
  process.exit(1);
}

const { compileMacroComponent, formatElfDiagnostic } = await import(pathToFileURL(compilerEntry));
const files = collectMacroFiles();
const diagnostics = [];

for (const { file, source } of files) {
  const filename = toRelative(file);
  const result = compileMacroComponent(source, {
    filename,
    templateTypeCheck: true
  });
  for (const diagnostic of result.diagnostics) {
    diagnostics.push(diagnostic);
  }
}

const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
const warnings = diagnostics.filter((diagnostic) => diagnostic.severity !== "error");

for (const diagnostic of diagnostics) {
  const output = diagnostic.file
    ? diagnostic
    : { ...diagnostic, file: toRelative(diagnostic.file) };
  const stream = diagnostic.severity === "error" ? process.stderr : process.stdout;
  stream.write(`${formatElfDiagnostic(output)}\n`);
}

const summary = `template typecheck scanned ${files.length} macro component files, ${errors.length} errors, ${warnings.length} warnings.`;
if (errors.length > 0) {
  console.error(summary);
  process.exit(1);
}

console.log(summary);
