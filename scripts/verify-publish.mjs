// cspell:ignore onwarn

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import { build as esbuild } from "esbuild";
import { rollup } from "rollup";
import { build as viteBuild } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const workspacePackages = [
  "packages/shared",
  "packages/reactivity",
  "packages/runtime",
  "packages/compiler-template",
  "packages/compiler",
  "packages/elfui",
  "packages/vite-plugin"
];

const run = (command, args, options = {}) => {
  const usesPackageManagerShell =
    process.platform === "win32" && (command === "npm" || command === "pnpm");
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "inherit",
    shell: options.shell ?? usesPackageManagerShell
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
};

const manifests = workspacePackages.map((packageDir) => {
  const manifestPath = join(repoRoot, packageDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.private === true || manifest.version === "0.0.0") {
    throw new Error(`${packageDir} is not versioned for publication.`);
  }
  for (const field of [
    "description",
    "license",
    "repository",
    "homepage",
    "bugs",
    "publishConfig"
  ]) {
    if (!manifest[field]) {
      throw new Error(`${manifest.name} is missing package metadata: ${field}.`);
    }
  }
  if (manifest.publishConfig.access !== "public") {
    throw new Error(`${manifest.name} must publish with public access.`);
  }
  if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) {
    throw new Error(`${manifest.name} must declare npm keywords.`);
  }
  if (!existsSync(join(repoRoot, packageDir, "README.md"))) {
    throw new Error(`${manifest.name} is missing its package README.md.`);
  }
  const distEntry = join(repoRoot, packageDir, "dist", "index.js");
  if (!existsSync(distEntry)) {
    throw new Error(`Missing ${distEntry}. Run pnpm build first.`);
  }
  return { packageDir, manifest };
});

const tempRoot = mkdtempSync(join(tmpdir(), "elfui-publish-verify-"));
const tarballDir = join(tempRoot, "tarballs");
const appDir = join(tempRoot, "app");
mkdirSync(tarballDir, { recursive: true });
mkdirSync(appDir, { recursive: true });

try {
  for (const { packageDir } of manifests) {
    run("pnpm", ["--dir", resolve(repoRoot, packageDir), "pack", "--pack-destination", tarballDir]);
  }

  const tarballs = readdirSync(tarballDir)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(tarballDir, name));
  if (tarballs.length !== manifests.length) {
    throw new Error(`Expected ${manifests.length} tarballs, received ${tarballs.length}.`);
  }

  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      { name: "elfui-publish-smoke", version: "0.0.0", private: true, type: "module" },
      null,
      2
    )
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], {
    cwd: appDir
  });

  for (const { manifest } of manifests) {
    const packageRoot = join(appDir, "node_modules", ...manifest.name.split("/"));
    const licensePath = join(packageRoot, "LICENSE");
    if (!existsSync(licensePath)) {
      throw new Error(`${manifest.name} package is missing LICENSE in installed tarball.`);
    }
    const readmePath = join(packageRoot, "README.md");
    if (!existsSync(readmePath)) {
      throw new Error(`${manifest.name} package is missing README.md in installed tarball.`);
    }
    const publishedManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    for (const [dependency, range] of Object.entries(publishedManifest.dependencies ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        throw new Error(`${manifest.name} leaks workspace dependency ${dependency}@${range}.`);
      }
    }
  }

  writeFileSync(
    join(appDir, "index.mjs"),
    [
      'import { createApp } from "@elfui/core";',
      'import { useRef } from "@elfui/reactivity";',
      'import { defineComponent, ensureCustomElement } from "@elfui/runtime";',
      'import { parse } from "@elfui/compiler-template";',
      'import { compileMacroComponent } from "@elfui/compiler";',
      'import { elfui as elfuiVite } from "@elfui/vite-plugin";',
      "",
      "const count = useRef(1);",
      "if (count.value !== 1 || typeof createApp !== 'function') throw new Error('elfui smoke failed');",
      "if (typeof defineComponent !== 'function' || typeof parse !== 'function') throw new Error('runtime/compiler parser smoke failed');",
      "if (typeof compileMacroComponent !== 'function') throw new Error('compiler smoke failed');",
      "if (typeof elfuiVite !== 'function') throw new Error('vite smoke failed');",
      "if (Object.prototype.hasOwnProperty.call(globalThis, '__DEV__')) throw new Error('package import polluted globalThis.__DEV__');",
      "const ServerComponent = defineComponent({ name: 'elf-publish-ssr-smoke', render: () => { throw new Error('SSR render executed'); } });",
      "if (ServerComponent.__elfDefinition.tag !== 'elf-publish-ssr-smoke') throw new Error('SSR component declaration failed');",
      "let ssrBoundary = false;",
      "try { ensureCustomElement(ServerComponent); } catch (error) { ssrBoundary = String(error).includes('[ELF_CUSTOM_ELEMENTS_UNAVAILABLE]'); }",
      "if (!ssrBoundary) throw new Error('SSR registration boundary failed');",
      ""
    ].join("\n")
  );

  run(process.execPath, [join(appDir, "index.mjs")], { cwd: appDir });

  writeFileSync(
    join(appDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022", "DOM"],
          skipLibCheck: false,
          noEmit: true
        },
        include: ["types.ts"]
      },
      null,
      2
    )
  );
  writeFileSync(
    join(appDir, "types.ts"),
    [
      'import { createApp, type ElfUIApp } from "@elfui/core";',
      'import { useRef, type Ref } from "@elfui/reactivity";',
      'import { defineComponent, type ElfElementConstructor } from "@elfui/runtime";',
      'import { parse, type RootNode } from "@elfui/compiler-template";',
      'import { compileMacroComponent } from "@elfui/compiler";',
      'import { elfui } from "@elfui/vite-plugin";',
      "",
      "const count: Ref<number> = useRef(1);",
      'const Component = defineComponent({ name: "elf-publish-types", register: false });',
      "const typed: ElfElementConstructor = Component;",
      'const ast: RootNode = parse("<button>ok</button>");',
      "const app: ElfUIApp = createApp(Component);",
      "const plugin = elfui();",
      "void [count, typed, ast, app, plugin, compileMacroComponent];",
      ""
    ].join("\n")
  );
  const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tscBin, "-p", appDir], { cwd: appDir });

  const consumerEntry = join(appDir, "consumer-entry.ts");
  writeFileSync(
    consumerEntry,
    [
      'import { useRef } from "@elfui/reactivity";',
      "",
      "export const elfuiConsumerValue = useRef(7).value;",
      "if (elfuiConsumerValue !== 7) throw new Error('bundled consumer failed');",
      ""
    ].join("\n")
  );

  const esbuildOutput = join(appDir, "dist-esbuild", "consumer.mjs");
  const rollupOutput = join(appDir, "dist-rollup", "consumer.mjs");
  const viteOutput = join(appDir, "dist-vite", "consumer.mjs");
  await esbuild({
    entryPoints: [consumerEntry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: esbuildOutput,
    treeShaking: true,
    logLevel: "silent"
  });
  const rollupBundle = await rollup({
    input: consumerEntry,
    plugins: [nodeResolve({ browser: true, exportConditions: ["import", "default"] })],
    treeshake: true,
    onwarn(warning) {
      throw new Error(`Rollup warning: ${warning.message}`);
    }
  });
  try {
    await rollupBundle.write({ file: rollupOutput, format: "es" });
  } finally {
    await rollupBundle.close();
  }
  await viteBuild({
    root: appDir,
    logLevel: "silent",
    build: {
      lib: {
        entry: consumerEntry,
        formats: ["es"],
        fileName: () => "consumer.mjs"
      },
      outDir: "dist-vite",
      emptyOutDir: true,
      minify: false,
      target: "es2022"
    }
  });

  for (const output of [esbuildOutput, rollupOutput, viteOutput]) {
    const bundled = readFileSync(output, "utf8");
    if (!bundled.includes("elfuiConsumerValue")) {
      throw new Error(`${output} did not preserve the consumer export.`);
    }
    for (const excluded of [
      "compileMacroComponent",
      "defineCustomElement",
      "ELF_CUSTOM_ELEMENT_CONFLICT"
    ]) {
      if (bundled.includes(excluded)) {
        throw new Error(`${output} retained unrelated ${excluded} code.`);
      }
    }
    run(process.execPath, [output], { cwd: appDir });
  }

  writeFileSync(
    join(appDir, "private-export.mjs"),
    [
      "let rejected = false;",
      'try { await import("@elfui/runtime/dist/index.js"); }',
      "catch (error) { rejected = error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'; }",
      "if (!rejected) throw new Error('private package path was importable');",
      ""
    ].join("\n")
  );
  run(process.execPath, [join(appDir, "private-export.mjs")], { cwd: appDir });

  console.log(
    `publish dry-run passed for ${manifests.length} packages with ESM, types, exports, tree shaking, esbuild, Rollup and Vite consumers.`
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
