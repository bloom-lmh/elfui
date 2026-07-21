import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const workspacePackages = [
  "packages/shared",
  "packages/reactivity",
  "packages/runtime",
  "packages/core"
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
};

for (const packageDir of workspacePackages) {
  const distEntry = join(repoRoot, packageDir, "dist", "index.js");
  if (!existsSync(distEntry)) {
    throw new Error(`Missing ${distEntry}. Run pnpm build before verify:light-install.`);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "elfui-light-install-"));
const tarballDir = join(tempRoot, "tarballs");
const appDir = join(tempRoot, "app");
mkdirSync(tarballDir, { recursive: true });
mkdirSync(appDir, { recursive: true });

try {
  for (const packageDir of workspacePackages) {
    run("pnpm", ["--dir", resolve(repoRoot, packageDir), "pack", "--pack-destination", tarballDir]);
  }

  const tarballs = readdirSync(tarballDir)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => join(tarballDir, name));
  const coreTarball = tarballs.find((name) => /elfui-core-.*\.tgz$/u.test(name));
  if (!coreTarball) throw new Error("Missing packed @elfui/core tarball.");

  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "elfui-light-install-smoke",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          "@elfui/core": `file:${coreTarball}`
        }
      },
      null,
      2
    )
  );

  // Install every local tarball without adding it to the application manifest. The
  // manifest deliberately declares only @elfui/core; the other runtime packages
  // must be reachable solely as its transitive dependencies.
  run("npm", ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], {
    cwd: appDir
  });

  const compilerDir = join(appDir, "node_modules", "@elfui", "compiler");
  if (existsSync(compilerDir)) {
    throw new Error("elfui light install unexpectedly installed @elfui/compiler.");
  }

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
        include: ["index.ts"]
      },
      null,
      2
    )
  );

  writeFileSync(
    join(appDir, "index.ts"),
    [
      'import { createApp, defineComponent, directive, useModel, useRef, type ElfElementConstructor } from "@elfui/core";',
      'import { text } from "@elfui/core/internal";',
      "",
      "const Counter = defineComponent<{ initial: number }, { change: [value: number] }>({",
      '  name: "x-light-counter",',
      "  props: { initial: { type: Number, default: 0 } },",
      "  setup(props, ctx) {",
      "    const count = useRef(props.initial);",
      '    ctx.emit("change", count.value);',
      "    return { count };",
      "  },",
      '  render: () => document.createElement("button"),',
      "  register: false",
      "});",
      "",
      "const typed: ElfElementConstructor = Counter;",
      "void directive;",
      "void useModel;",
      "void text;",
      "export { Counter, typed, createApp };",
      ""
    ].join("\n")
  );

  writeFileSync(
    join(appDir, "index.mjs"),
    [
      'import { createApp, defineComponent, useRef } from "@elfui/core";',
      "",
      "const count = useRef(1);",
      "if (count.value !== 1) throw new Error('useRef smoke failed');",
      "if (typeof createApp !== 'function' || typeof defineComponent !== 'function') throw new Error('elfui API smoke failed');",
      "if (Object.prototype.hasOwnProperty.call(globalThis, '__DEV__')) throw new Error('light import polluted globalThis.__DEV__');",
      ""
    ].join("\n")
  );

  const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  run(process.execPath, [tscBin, "-p", appDir], { cwd: appDir });
  run(process.execPath, [join(appDir, "index.mjs")], { cwd: appDir });

  console.log("light install smoke passed without @elfui/compiler.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
