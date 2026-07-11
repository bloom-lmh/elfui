#!/usr/bin/env node
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const root = resolve(".");
const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const hasArg = (name) => args.includes(`--${name}`);
const readArg = (name) => {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const alias = {
  "@elfui/shared": resolve(root, "packages/shared/src/index.ts"),
  "@elfui/reactivity": resolve(root, "packages/reactivity/src/index.ts"),
  "@elfui/runtime": resolve(root, "packages/runtime/src/index.ts"),
  "@elfui/runtime/internal": resolve(root, "packages/runtime/src/internal.ts")
};

const aliasPlugin = {
  name: "elfui-browser-benchmark-alias",
  setup(buildApi) {
    buildApi.onResolve(
      { filter: /^@elfui\/(?:shared|reactivity|runtime(?:\/internal)?)$/ },
      (args) => ({
        path: alias[args.path]
      })
    );
  }
};

const entry = `
import { effectScope, useRef } from "@elfui/reactivity";
import { list, mark, text } from "@elfui/runtime/internal";

const makeItems = (count, salt = 0) =>
  Array.from({ length: count }, (_, id) => ({ id, label: "Item " + (id + salt) }));

const swapEdges = (items) => {
  const next = items.slice();
  if (next.length > 1) {
    const first = next[0];
    next[0] = next[next.length - 1];
    next[next.length - 1] = first;
  }
  return next;
};

globalThis.__elfBrowserBench = {
  helloMount(count) {
    const root = document.createElement("main");
    document.body.appendChild(root);
    for (let i = 0; i < count; i++) {
      const scope = effectScope(true);
      const msg = useRef("hello " + i);
      const node = document.createTextNode("");
      scope.run(() => text(node, () => msg.value));
      root.appendChild(node);
      msg.set("world " + i);
      scope.stop();
    }
    root.remove();
  },
  listCreate(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const anchor = mark("browser-list-create");
    const items = useRef(makeItems(count));
    root.appendChild(anchor);
    document.body.appendChild(root);
    scope.run(() => {
      list(
        anchor,
        () => items.value,
        (item) => item.id,
        (item) => {
          const row = document.createElement("div");
          row.textContent = item.label;
          return row;
        }
      );
    });
    scope.stop();
    root.remove();
  },
  listSwap(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const anchor = mark("browser-list-swap");
    const items = useRef(makeItems(count));
    root.appendChild(anchor);
    document.body.appendChild(root);
    scope.run(() => {
      list(
        anchor,
        () => items.value,
        (item) => item.id,
        (item) => {
          const row = document.createElement("div");
          row.textContent = item.label;
          return row;
        }
      );
    });
    items.set(swapEdges(items.peek()));
    scope.stop();
    root.remove();
  },
  listUpdate(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const anchor = mark("browser-list-update");
    const items = useRef(makeItems(count));
    root.appendChild(anchor);
    document.body.appendChild(root);
    scope.run(() => {
      list(
        anchor,
        () => items.value,
        (item) => item.id,
        (item) => {
          const row = document.createElement("div");
          const label = document.createTextNode("");
          row.appendChild(label);
          text(label, () => item.label);
          return row;
        }
      );
    });
    for (let i = 0; i < items.value.length; i += 10) {
      items.value[i].label = items.value[i].label + "!";
    }
    scope.stop();
    root.remove();
  },
  eventDispatch(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const clicks = useRef(0);
    const button = document.createElement("button");
    const label = document.createTextNode("");
    button.appendChild(label);
    scope.run(() => text(label, () => clicks.value));
    button.addEventListener("click", () => clicks.set(clicks.peek() + 1));
    root.appendChild(button);
    document.body.appendChild(root);
    for (let i = 0; i < count; i++) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    scope.stop();
    root.remove();
  },
  memoryRelease(count, rounds) {
    const before = performance.memory?.usedJSHeapSize ?? 0;
    for (let i = 0; i < rounds; i++) {
      this.listCreate(count);
    }
    if (typeof gc === "function") gc();
    const after = performance.memory?.usedJSHeapSize ?? 0;
    return { before, after, retained: after && before ? after - before : 0 };
  }
};
`;

const bundle = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    loader: "ts"
  },
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  platform: "browser",
  legalComments: "none",
  define: { __DEV__: "false" },
  plugins: [aliasPlugin]
});

const chromeCandidates =
  process.platform === "win32"
    ? [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ]
    : [
        process.env.CHROME_PATH,
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge"
      ];

const browserPath = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
if (!browserPath) {
  console.error(
    [
      "Chrome/Chromium executable was not found.",
      "Set CHROME_PATH to run the browser benchmark, for example:",
      "  CHROME_PATH=/path/to/chrome node scripts/benchmark-browser.mjs --json"
    ].join("\n")
  );
  process.exit(1);
}

const runner = `
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
};
const encode = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value))));
const runCase = (label, fn, params, options = {}) => {
  const warmup = options.warmup || 1;
  const iterations = options.iterations || 5;
  const samples = [];
  for (let i = 0; i < warmup + iterations; i++) {
    document.body.replaceChildren();
    const startedAt = performance.now();
    globalThis.__elfBrowserBench[fn](...params);
    const duration = performance.now() - startedAt;
    if (i >= warmup) samples.push(duration);
  }
  return {
    label,
    samples,
    median: median(samples),
    min: Math.min(...samples),
    max: Math.max(...samples)
  };
};
(() => {
  try {
    const results = [
      runCase("hello mount 300", "helloMount", [300]),
      runCase("list create 1k", "listCreate", [1000]),
      runCase("list swap 1k", "listSwap", [1000]),
      runCase("list update 1k", "listUpdate", [1000]),
      runCase("event dispatch 1k", "eventDispatch", [1000])
    ];
    const memory = globalThis.__elfBrowserBench.memoryRelease(500, 5);
    const payload = {
      userAgent: navigator.userAgent,
      generatedAt: new Date().toISOString(),
      results,
      memory
    };
    document.body.innerHTML = '<pre id="result" data-json="' + encode(payload) + '"></pre>';
  } catch (err) {
    document.body.innerHTML = '<pre id="error" data-json="' + encode({
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : ""
    }) + '"></pre>';
  }
})();
`;

const tempDir = await mkdtemp(resolve(tmpdir(), "elfui-browser-bench-"));
const htmlPath = resolve(tempDir, "bench.html");
await writeFile(
  htmlPath,
  `<!doctype html><meta charset="utf-8"><body><script>${bundle.outputFiles[0].text}</script><script>${runner}</script></body>`,
  "utf8"
);

let stdout;
try {
  const result = await execFileAsync(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--allow-file-access-from-files",
      "--js-flags=--expose-gc",
      "--virtual-time-budget=30000",
      "--dump-dom",
      pathToFileURL(htmlPath).href
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  stdout = result.stdout;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const decodePayload = (value) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));
const errorMatch = stdout.match(/<pre id="error" data-json="([^"]+)"><\/pre>/);
if (errorMatch) {
  const error = decodePayload(errorMatch[1]);
  console.error(error.stack || error.message);
  process.exit(1);
}
const match = stdout.match(/<pre id="result" data-json="([^"]+)"><\/pre>/);
if (!match) {
  console.error("Browser benchmark did not produce a result payload.");
  process.exit(1);
}

const payload = decodePayload(match[1]);
const { results, memory } = payload;

const formatMs = (value) => `${value.toFixed(2)} ms`;
const reportPath = readArg("report");
if (reportPath) {
  const lines = [
    "# ElfUI Browser Benchmark",
    "",
    `> Generated by \`npm run benchmark:browser\` on ${payload.generatedAt}.`,
    "",
    "| Case | Median | Min | Max |",
    "| --- | ---: | ---: | ---: |"
  ];
  for (const result of results) {
    lines.push(
      `| ${result.label} | ${formatMs(result.median)} | ${formatMs(result.min)} | ${formatMs(result.max)} |`
    );
  }
  lines.push(
    "",
    "## Memory Smoke",
    "",
    `retained: ${((memory.retained ?? 0) / 1024).toFixed(2)} KB`
  );
  lines.push("");
  await writeFile(resolve(root, reportPath), lines.join("\\n"), "utf8");
}

if (hasArg("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("\\nElfUI browser benchmark\\n");
  for (const result of results) {
    console.log(`${result.label}: median ${formatMs(result.median)}`);
  }
  console.log(`memory retained: ${((memory.retained ?? 0) / 1024).toFixed(2)} KB`);
}
