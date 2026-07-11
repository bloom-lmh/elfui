#!/usr/bin/env node
// cspell:ignore csp
import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dynamicCodePattern = /\bnew\s+Function\b|\bFunction\s*\(/u;
const withPattern = /\bwith\s*\(/u;

const sourceEntries = new Map(
  Object.entries({
    "@elfui/shared": "packages/shared/src/index.ts",
    "@elfui/reactivity": "packages/reactivity/src/index.ts",
    "@elfui/runtime": "packages/runtime/src/index.ts",
    "@elfui/runtime/internal": "packages/runtime/src/internal.ts",
    "@elfui/compiler-template": "packages/compiler-template/src/index.ts",
    "@elfui/compiler": "packages/compiler/src/index.ts",
    "@elfui/core": "packages/elfui/src/index.ts"
  }).map(([key, value]) => [key, resolve(root, value)])
);

const textOf = (file) => new TextDecoder().decode(file.contents);

const sourceAliasPlugin = {
  name: "elfui-source-alias",
  setup(api) {
    api.onResolve({ filter: /^@elfui\// }, (args) => {
      const entry = sourceEntries.get(args.path);
      return entry ? { path: entry } : null;
    });
  }
};

const bundle = async ({
  name,
  entry,
  stdin,
  platform = "browser",
  minify = true,
  external = []
}) => {
  const result = await build({
    ...(entry ? { entryPoints: [entry] } : {}),
    ...(stdin ? { stdin } : {}),
    bundle: true,
    format: "esm",
    platform,
    minify,
    write: false,
    legalComments: "none",
    treeShaking: true,
    define: { __DEV__: "false" },
    external,
    plugins: [sourceAliasPlugin]
  });
  const output = textOf(result.outputFiles[0]);
  return { name, output };
};

const assertNoDynamicCode = ({ name, output }) => {
  if (dynamicCodePattern.test(output) || withPattern.test(output)) {
    throw new Error(`${name} must not contain dynamic code evaluation.`);
  }
};

const loadMacroCompiler = async () => {
  const cacheRoot = join(root, "node_modules", ".cache");
  await mkdir(cacheRoot, { recursive: true });
  const tempDir = await mkdtemp(join(cacheRoot, "elfui-csp-"));
  try {
    const bundled = await bundle({
      name: "macro compiler",
      entry: resolve(root, "packages/compiler/src/macro-component.ts"),
      platform: "node",
      minify: false,
      external: ["typescript"]
    });
    const outputPath = join(tempDir, "macro-component.mjs");
    await writeFile(outputPath, bundled.output, "utf8");
    const imported = await import(pathToFileURL(outputPath).href);
    return {
      compileMacroComponent: imported.compileMacroComponent,
      cleanup: () => rm(tempDir, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
};

const macroSource = `
import { defineEmits, defineHtml, defineProps, html, useRef } from "@elfui/core";

const props = defineProps<{ disabled: boolean; label: string }>({
  disabled: { type: Boolean, default: false },
  label: { type: String, default: "Save" }
});
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const count = useRef(0);
const press = (event: MouseEvent) => {
  count.set(count.peek() + 1);
  emit("click", event);
};

export const SafeButton = defineHtml(html\`
  <button :disabled=\${props.disabled} @click=\${press}>
    \${props.label} \${count}
  </button>
\`);
`;

const main = async () => {
  const light = await bundle({
    name: "elfui light",
    entry: resolve(root, "packages/elfui/src/index.ts")
  });
  const runtime = await bundle({
    name: "@elfui/runtime",
    entry: resolve(root, "packages/runtime/src/index.ts")
  });
  const macroApi = await bundle({
    name: "@elfui/core",
    entry: resolve(root, "packages/elfui/src/index.ts")
  });

  assertNoDynamicCode(light);
  assertNoDynamicCode(runtime);
  assertNoDynamicCode(macroApi);

  const { compileMacroComponent, cleanup } = await loadMacroCompiler();
  try {
    const generated = compileMacroComponent(macroSource, {
      filename: "SafeButton.elf.ts",
      templateTypeCheck: false
    });
    const errors = generated.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `macro fixture failed to compile: ${errors.map((item) => item.message).join("; ")}`
      );
    }
    if (generated.code.includes("@elfui/chain") || generated.code.includes("template:")) {
      throw new Error("macro output must use the light entry and precompiled render.");
    }
    assertNoDynamicCode({ name: "macro generated code", output: generated.code });

    const macroGenerated = await bundle({
      name: "macro generated bundle",
      stdin: {
        contents: generated.code,
        loader: "ts",
        resolveDir: root,
        sourcefile: "SafeButton.generated.ts"
      }
    });
    assertNoDynamicCode(macroGenerated);
  } finally {
    await cleanup();
  }

  console.log("CSP boundary check passed.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
