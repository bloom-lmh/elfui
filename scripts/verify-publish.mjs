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
    const licensePath = join(appDir, "node_modules", ...manifest.name.split("/"), "LICENSE");
    if (!existsSync(licensePath)) {
      throw new Error(`${manifest.name} package is missing LICENSE in installed tarball.`);
    }
    const readmePath = join(appDir, "node_modules", ...manifest.name.split("/"), "README.md");
    if (!existsSync(readmePath)) {
      throw new Error(`${manifest.name} package is missing README.md in installed tarball.`);
    }
  }

  writeFileSync(
    join(appDir, "index.mjs"),
    [
      'import { createApp } from "@elfui/core";',
      'import { useRef } from "@elfui/reactivity";',
      'import { defineComponent } from "@elfui/runtime";',
      'import { parse } from "@elfui/compiler-template";',
      'import { compileMacroComponent } from "@elfui/compiler";',
      'import { elfui as elfuiVite } from "@elfui/vite-plugin";',
      "",
      "const count = useRef(1);",
      "if (count.value !== 1 || typeof createApp !== 'function') throw new Error('elfui smoke failed');",
      "if (typeof defineComponent !== 'function' || typeof parse !== 'function') throw new Error('runtime/compiler parser smoke failed');",
      "if (typeof compileMacroComponent !== 'function') throw new Error('compiler smoke failed');",
      "if (typeof elfuiVite !== 'function') throw new Error('vite smoke failed');",
      ""
    ].join("\n")
  );

  run(process.execPath, [join(appDir, "index.mjs")], { cwd: appDir });
  console.log(`publish dry-run passed for ${manifests.length} packages.`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
