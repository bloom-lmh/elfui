import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaultPackages = [
  "packages/shared",
  "packages/reactivity",
  "packages/runtime",
  "packages/compiler-template",
  "packages/compiler",
  "packages/elfui",
  "packages/vite-plugin"
];

const targets = process.argv.slice(2);
const packageDirs = targets.length > 0 ? targets : defaultPackages;

const hasKnownExtension = (specifier) => path.posix.extname(specifier) !== "";

const withJsExtension = (specifier) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (hasKnownExtension(specifier)) return specifier;
  return `${specifier}.js`;
};

const removeLegacyDevFallback = (code) =>
  code.replace(/^globalThis\.__DEV__ \?\?= true;\r?\n/u, "");

const rewriteImports = (code) =>
  code
    .replace(/(\bfrom\s*["'])(\.{1,2}\/[^"']+)(["'])/g, (_, start, specifier, end) => {
      return `${start}${withJsExtension(specifier)}${end}`;
    })
    .replace(/(\bimport\s*["'])(\.{1,2}\/[^"']+)(["'])/g, (_, start, specifier, end) => {
      return `${start}${withJsExtension(specifier)}${end}`;
    })
    .replace(
      /(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_, start, specifier, end) => `${start}${withJsExtension(specifier)}${end}`
    );

const walk = async (dir, files = []) => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))) {
      files.push(fullPath);
    }
  }
  return files;
};

for (const packageDir of packageDirs) {
  const distDir = path.join(repoRoot, packageDir, "dist");
  try {
    const info = await stat(distDir);
    if (!info.isDirectory()) continue;
  } catch {
    continue;
  }

  const files = await walk(distDir);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const next = rewriteImports(removeLegacyDevFallback(source));
    if (next !== source) {
      await writeFile(file, next);
    }
  }
}
