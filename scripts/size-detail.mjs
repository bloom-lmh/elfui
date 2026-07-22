#!/usr/bin/env node
// 模块级体积分析：分别打包每个公开入口/独立模块，看它们各自的 gzip
import { build } from "esbuild";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// 临时目录写入 entry 文件
const tmpDir = resolve(root, ".tmp-size");
fs.mkdirSync(tmpDir, { recursive: true });

// 测试每个 export 单独打包后的 gzip 大小
// 单独看的时候内部依赖也会被 bundle 进来，所以这是"用户只用这一个 API 时的总体积"
const apis = [
  // reactivity
  ["useRef (reactivity)", `import { useRef } from "@elfui/reactivity"; export { useRef };`],
  ["useReactive", `import { useReactive } from "@elfui/reactivity"; export { useReactive };`],
  ["useEffect", `import { useEffect } from "@elfui/reactivity"; export { useEffect };`],
  ["useComputed", `import { useComputed } from "@elfui/reactivity"; export { useComputed };`],
  ["watch", `import { watch } from "@elfui/reactivity"; export { watch };`],
  ["effectScope", `import { effectScope } from "@elfui/reactivity"; export { effectScope };`],
  ["readonly", `import { readonly } from "@elfui/reactivity"; export { readonly };`],
  ["useShallowRef", `import { useShallowRef } from "@elfui/reactivity"; export { useShallowRef };`],
  // runtime — 内置组件
  ["transition", `import { transition } from "@elfui/runtime"; export { transition };`],
  [
    "transitionGroup",
    `import { transitionGroup } from "@elfui/runtime"; export { transitionGroup };`
  ],
  ["keepAlive", `import { keepAlive } from "@elfui/runtime"; export { keepAlive };`],
  ["teleport", `import { teleport } from "@elfui/runtime"; export { teleport };`],
  ["suspense", `import { suspense } from "@elfui/runtime"; export { suspense };`],
  [
    "dynamicComponent",
    `import { dynamicComponent } from "@elfui/runtime"; export { dynamicComponent };`
  ],
  // runtime — hooks
  ["useFocusTrap", `import { useFocusTrap } from "@elfui/runtime"; export { useFocusTrap };`],
  [
    "useResizeObserver",
    `import { useResizeObserver } from "@elfui/runtime"; export { useResizeObserver };`
  ],
  [
    "useIntersectionObserver",
    `import { useIntersectionObserver } from "@elfui/runtime"; export { useIntersectionObserver };`
  ],
  ["useScrollLock", `import { useScrollLock } from "@elfui/runtime"; export { useScrollLock };`],
  ["useEscapeKey", `import { useEscapeKey } from "@elfui/runtime"; export { useEscapeKey };`],
  // form-control
  [
    "createFormControlContext",
    `import { createFormControlContext } from "@elfui/runtime"; export { createFormControlContext };`
  ],
  // directive internals used by app.directive() and compiled templates
  [
    "directive internals",
    `import { registerGlobalDirective, applyCustomDirective, resolveDirective } from "@elfui/runtime/internal"; export { registerGlobalDirective, applyCustomDirective, resolveDirective };`
  ],
  // unwrap helper（被 compiler 调用）
  [
    "unwrapStateAccess",
    `import { unwrapStateAccess } from "@elfui/runtime/internal"; export { unwrapStateAccess };`
  ]
];

const results = [];
for (const [label, code] of apis) {
  const entry = resolve(tmpDir, `entry-${label.replace(/[^a-z0-9]/gi, "_")}.ts`);
  fs.writeFileSync(entry, code);
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    minify: true,
    treeShaking: true,
    write: false,
    platform: "browser",
    legalComments: "none",
    define: { __DEV__: "false" }
  });
  const bytes = r.outputFiles[0].contents;
  const gz = gzipSync(bytes, { level: 9 });
  const br = brotliCompressSync(bytes, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
  });
  results.push({ label, min: bytes.byteLength, gz: gz.byteLength, br: br.byteLength });
}

results.sort((a, b) => b.gz - a.gz);
console.log("\n📦 单 API 引入体积（含全部传递依赖）\n");
console.log("┌─────────────────────────────────────────────────┬──────────┬──────────┬──────────┐");
console.log(
  "│ API                                              │   min    │   gzip   │  brotli  │"
);
console.log("├─────────────────────────────────────────────────┼──────────┼──────────┼──────────┤");
for (const r of results) {
  console.log(
    `│ ${r.label.padEnd(48)} │ ${(r.min / 1024).toFixed(2).padStart(6)} KB │ ${(r.gz / 1024).toFixed(2).padStart(6)} KB │ ${(r.br / 1024).toFixed(2).padStart(6)} KB │`
  );
}
console.log(
  "└─────────────────────────────────────────────────┴──────────┴──────────┴──────────┘\n"
);

const aggregate = await build({
  entryPoints: [resolve(root, "packages/core/src/index.ts")],
  bundle: true,
  format: "esm",
  minify: true,
  treeShaking: true,
  write: false,
  metafile: true,
  platform: "browser",
  legalComments: "none",
  define: { __DEV__: "false" }
});
const aggregateBytes = aggregate.outputFiles[0].contents;
const aggregateGzip = gzipSync(aggregateBytes, { level: 9 }).byteLength;
const aggregateBrotli = brotliCompressSync(aggregateBytes, {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
}).byteLength;
const contributionByPackage = new Map();
const output = Object.values(aggregate.metafile.outputs)[0];
for (const [input, contribution] of Object.entries(output.inputs)) {
  const normalized = input.replaceAll("\\", "/");
  const match = normalized.match(/packages\/(shared|reactivity|runtime|core)\//);
  const group = match?.[1] ?? "other";
  contributionByPackage.set(
    group,
    (contributionByPackage.get(group) ?? 0) + contribution.bytesInOutput
  );
}
const contributionRows = [...contributionByPackage]
  .map(([label, bytes]) => ({ label, bytes }))
  .sort((a, b) => b.bytes - a.bytes);

console.log("@elfui/core aggregate public facade attribution\n");
console.log(
  `total: ${(aggregateBytes.byteLength / 1024).toFixed(2)} KB min / ${(aggregateGzip / 1024).toFixed(2)} KB gzip / ${(aggregateBrotli / 1024).toFixed(2)} KB brotli`
);
for (const row of contributionRows) {
  console.log(`${row.label.padEnd(12)} ${(row.bytes / 1024).toFixed(2).padStart(7)} KB min`);
}
console.log("");

fs.rmSync(tmpDir, { recursive: true, force: true });
