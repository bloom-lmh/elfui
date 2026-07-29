#!/usr/bin/env node
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDirs = ["reactivity", "runtime", "compiler", "core"];

const collectJavaScript = async (directory, files = []) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectJavaScript(path, files);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
};

const distFiles = (
  await Promise.all(
    packageDirs.map((packageName) =>
      collectJavaScript(resolve(root, "packages", packageName, "dist"))
    )
  )
).flat();

for (const file of distFiles) {
  const source = await readFile(file, "utf8");
  if (/globalThis\.__DEV__|__DEV__\s*\?\?=/u.test(source)) {
    throw new Error(`Published ESM mutates the global DEV flag: ${file}`);
  }
}

const hadGlobalDev = Object.prototype.hasOwnProperty.call(globalThis, "__DEV__");
for (const packageName of packageDirs) {
  const entry = resolve(root, "packages", packageName, "dist", "index.js");
  await import(`${pathToFileURL(entry).href}?dev-boundary=${Date.now()}-${packageName}`);
}
if (!hadGlobalDev && Object.prototype.hasOwnProperty.call(globalThis, "__DEV__")) {
  throw new Error("Importing published ESM created globalThis.__DEV__.");
}

const production = await build({
  entryPoints: [resolve(root, "packages", "core", "dist", "index.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  treeShaking: true,
  write: false,
  legalComments: "none",
  define: { __DEV__: "false" }
});
const output = new TextDecoder().decode(production.outputFiles[0].contents);
for (const marker of ["[elfui:devtools]", "[readonly]", "app:mount", "app:unmount"]) {
  if (output.includes(marker)) {
    throw new Error(`Production bundle retained DEV-only branch marker: ${marker}`);
  }
}

const allocationProbe = await build({
  stdin: {
    contents: `
      import { createInstance } from "./packages/runtime/src/lifecycle.ts";
      import { createDevtoolsComponentId } from "./packages/runtime/src/devtools.ts";
      import { createReactivityEffectId } from "./packages/reactivity/src/devtools.ts";
      const instance = createInstance({}, null);
      export const result = {
        hasComponentState: Object.prototype.hasOwnProperty.call(instance, "devtools"),
        componentId: createDevtoolsComponentId(),
        effectId: createReactivityEffectId()
      };
    `,
    resolveDir: root,
    loader: "js"
  },
  bundle: true,
  format: "esm",
  platform: "node",
  minify: true,
  treeShaking: true,
  write: false,
  legalComments: "none",
  define: { __DEV__: "false" }
});
const probeSource = new TextDecoder().decode(allocationProbe.outputFiles[0].contents);
const probeModule = await import(
  `data:text/javascript;base64,${Buffer.from(probeSource).toString("base64")}`
);
if (
  probeModule.result.hasComponentState ||
  probeModule.result.componentId !== "" ||
  probeModule.result.effectId !== ""
) {
  throw new Error(
    `Production DevTools allocation probe failed: ${JSON.stringify(probeModule.result)}`
  );
}

console.log(
  `DEV boundary check passed for ${distFiles.length} ESM files; production branches and instance state were removed.`
);
