#!/usr/bin/env node
import { build } from "esbuild";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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

const staticRows = Array.from(
  { length: 20 },
  (_, index) => `<div class="row"><span>Static row ${index}</span></div>`
).join("");
const { code: staticRenderModule } = (await import("../packages/compiler/dist/codegen.js")).codegen(
  `<section class="card"><h1>Static title</h1>${staticRows}</section>`,
  {
    functionName: "renderHoistedStatic"
  }
);
const staticRenderCode = staticRenderModule.replace(
  "export default function renderHoistedStatic",
  "function renderHoistedStatic"
);

const entry = `
import { effectScope, useRef } from "@elfui/reactivity";
import { defineCustomElement } from "@elfui/runtime";
import { applyCustomDirective, list, mark, on, text } from "@elfui/runtime/internal";

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

defineCustomElement({
  tag: "elf-browser-bench-shadow",
  styles: [":host{display:block}span{color:var(--elf-bench-color,black)}"],
  render() {
    const span = document.createElement("span");
    span.textContent = "shadow";
    return span;
  }
});

defineCustomElement({
  tag: "elf-browser-bench-static-direct",
  render() {
    const section = document.createElement("section");
    section.setAttribute("class", "card");
    const heading = document.createElement("h1");
    heading.appendChild(document.createTextNode("Static title"));
    section.appendChild(heading);
    for (let index = 0; index < 20; index++) {
      const row = document.createElement("div");
      row.setAttribute("class", "row");
      const label = document.createElement("span");
      label.appendChild(document.createTextNode("Static row " + index));
      row.appendChild(label);
      section.appendChild(row);
    }
    return section;
  }
});

${staticRenderCode}

defineCustomElement({
  tag: "elf-browser-bench-static-hoisted",
  render: renderHoistedStatic
});

const mountStaticShadows = (tag, count) => {
  const root = document.createElement("main");
  document.body.appendChild(root);
  for (let i = 0; i < count; i++) root.appendChild(document.createElement(tag));
  if (root.querySelector(tag)?.shadowRoot?.querySelector("h1")?.textContent !== "Static title") {
    throw new Error("static shadow mount failed");
  }
  root.remove();
};

globalThis.__elfBrowserBench = {
  staticShadowDirect(count) {
    mountStaticShadows("elf-browser-bench-static-direct", count);
  },
  staticShadowHoisted(count) {
    mountStaticShadows("elf-browser-bench-static-hoisted", count);
  },
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
          row.textContent = item.peek().label;
          return row;
        }
      );
    });
    if (root.querySelectorAll("div").length !== count) throw new Error("list create failed");
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
          row.textContent = item.peek().label;
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
          text(label, () => item.value.label);
          return row;
        }
      );
    });
    for (let i = 0; i < items.value.length; i += 10) {
      items.value[i].label = items.value[i].label + "!";
    }
    if (!root.querySelector("div")?.textContent?.endsWith("!")) {
      throw new Error("list update failed");
    }
    scope.stop();
    root.remove();
  },
  listSameKey(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const anchor = mark("browser-list-same-key");
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
          text(label, () => item.value.label);
          return row;
        }
      );
    });
    items.set(makeItems(count, 10000));
    if (root.querySelector("div")?.textContent !== "Item 10000") {
      throw new Error("same-key replacement failed");
    }
    scope.stop();
    root.remove();
  },
  tableUpdate(rows, columns) {
    const scope = effectScope(true);
    const values = Array.from({ length: rows }, (_, row) => useRef(row));
    const table = document.createElement("table");
    const body = document.createElement("tbody");
    table.appendChild(body);
    scope.run(() => {
      for (let row = 0; row < rows; row++) {
        const tr = document.createElement("tr");
        for (let column = 0; column < columns; column++) {
          const td = document.createElement("td");
          const value = document.createTextNode("");
          td.appendChild(value);
          text(value, () => values[row].value + ":" + column);
          tr.appendChild(td);
        }
        body.appendChild(tr);
      }
    });
    document.body.appendChild(table);
    for (let row = 0; row < rows; row += 10) values[row].set(values[row].peek() + 1000);
    if (body.rows[0]?.cells[0]?.textContent !== "1000:0") throw new Error("table update failed");
    scope.stop();
    table.remove();
  },
  async directiveUpdate(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const values = Array.from({ length: count }, (_, index) => useRef(index));
    let mounted = 0;
    let updated = 0;
    document.body.appendChild(root);
    scope.run(() => {
      for (let index = 0; index < count; index++) {
        const el = document.createElement("div");
        root.appendChild(el);
        applyCustomDirective(
          el,
          {
            mounted() { mounted++; },
            updated() { updated++; }
          },
          () => values[index].value
        );
      }
    });
    await Promise.resolve();
    for (const value of values) value.set(value.peek() + 1);
    if (mounted !== count || updated !== count) throw new Error("directive update failed");
    scope.stop();
    root.remove();
  },
  async shadowMount(count) {
    const root = document.createElement("main");
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      fragment.appendChild(document.createElement("elf-browser-bench-shadow"));
    }
    root.appendChild(fragment);
    document.body.appendChild(root);
    await Promise.resolve();
    const first = root.firstElementChild;
    if (!first?.shadowRoot?.querySelector("span")) throw new Error("shadow mount failed");
    root.remove();
    await Promise.resolve();
  },
  eventDispatch(count) {
    const scope = effectScope(true);
    const root = document.createElement("main");
    const clicks = useRef(0);
    const button = document.createElement("button");
    const label = document.createTextNode("");
    button.appendChild(label);
    scope.run(() => text(label, () => clicks.value));
    const dispose = on(button, "click", () => {
      clicks.set(clicks.peek() + 1);
      clicks.set(clicks.peek() + 1);
    });
    root.appendChild(button);
    document.body.appendChild(root);
    for (let i = 0; i < count; i++) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    dispose();
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
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
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
const runCase = async (label, fn, params, options = {}) => {
  const warmup = options.warmup || 1;
  const iterations = options.iterations || 5;
  const samples = [];
  for (let i = 0; i < warmup + iterations; i++) {
    document.body.replaceChildren();
    const startedAt = performance.now();
    await globalThis.__elfBrowserBench[fn](...params);
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
(async () => {
  try {
    const results = [];
    results.push(await runCase("hello mount 300", "helloMount", [300]));
    results.push(await runCase("list create 1k", "listCreate", [1000]));
    results.push(await runCase("list create 10k", "listCreate", [10000], { iterations: 3 }));
    results.push(await runCase("list swap 1k", "listSwap", [1000]));
    results.push(await runCase("list update 1k", "listUpdate", [1000]));
    results.push(await runCase("list same-key 1k", "listSameKey", [1000]));
    results.push(await runCase("table partial update 1k cells", "tableUpdate", [100, 10]));
    results.push(await runCase("directive mount/update 500", "directiveUpdate", [500]));
    results.push(await runCase("shadow components 1k", "shadowMount", [1000], { iterations: 3 }));
    results.push(await runCase("static shadow direct 1k", "staticShadowDirect", [1000]));
    results.push(await runCase("static shadow hoisted 1k", "staticShadowHoisted", [1000]));
    results.push(await runCase("event dispatch 1k", "eventDispatch", [1000]));
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
  const resolvedReportPath = resolve(root, reportPath);
  const lines = [
    "# ElfUI Browser Benchmark",
    "",
    `> Generated by \`pnpm benchmark:browser\` on ${payload.generatedAt}.`,
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
  await mkdir(dirname(resolvedReportPath), { recursive: true });
  await writeFile(resolvedReportPath, lines.join("\n"), "utf8");
}

if (hasArg("json")) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("\nElfUI browser benchmark\n");
  for (const result of results) {
    console.log(`${result.label}: median ${formatMs(result.median)}`);
  }
  console.log(`memory retained: ${((memory.retained ?? 0) / 1024).toFixed(2)} KB`);
}
