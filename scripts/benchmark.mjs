#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true
});
const { window } = dom;

Object.assign(globalThis, {
  window,
  document: window.document,
  Node: window.Node,
  Comment: window.Comment,
  DocumentFragment: window.DocumentFragment,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  SVGElement: window.SVGElement,
  Text: window.Text,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  CustomEvent: window.CustomEvent,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  __DEV__: false
});

const [runtime, reactivity, vue, litHtml, solidRuntime, solidWeb] = await Promise.all([
  import("../packages/runtime/dist/internal.js"),
  import("../packages/reactivity/dist/index.js"),
  import("vue"),
  import("lit-html"),
  import("solid-js/dist/solid.js"),
  import("solid-js/web/dist/web.js")
]);

const rootPackage = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const versionOf = (name) => rootPackage.devDependencies?.[name]?.replace(/^[^\d]*/, "") ?? "local";

const { effectScope, useRef } = reactivity;
const { list, mark, text } = runtime;
const { createApp, h, nextTick, ref } = vue;
const { html, render: litRender } = litHtml;
const { createEffect, createSignal } = solidRuntime;
const { render: solidRender } = solidWeb;

const args = new Set(process.argv.slice(2));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? resolve(reportArg.slice("--report=".length)) : null;

const resetDom = () => {
  document.body.replaceChildren();
};

const flush = async () => {
  await Promise.resolve();
  await new Promise((resolveFlush) => queueMicrotask(resolveFlush));
};

const makeItems = (count, salt = 0) =>
  Array.from({ length: count }, (_, id) => ({
    id,
    label: `Item ${id + salt}`
  }));

const swapEdges = (items) => {
  const next = items.slice();
  if (next.length > 1) {
    [next[0], next[next.length - 1]] = [next[next.length - 1], next[0]];
  }
  return next;
};

const makeTableRows = (rows, cols, salt = 0) =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => `R${row + salt}:C${col}`)
  );

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const measure = async (label, factory, options = {}) => {
  const warmup = options.warmup ?? 1;
  const iterations = options.iterations ?? 5;
  const samples = [];

  for (let i = 0; i < warmup + iterations; i++) {
    resetDom();
    const task = await factory();
    const startedAt = performance.now();
    await task.run();
    await flush();
    const duration = performance.now() - startedAt;
    await task.cleanup?.();
    resetDom();
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

const formatMs = (value) => `${value.toFixed(2)} ms`;

const createElfAdapter = () => ({
  name: "ElfUI",
  version: "local",
  note: "runtime helper + reactivity dist",
  helloMount: () => ({
    async run() {
      for (let i = 0; i < 200; i++) {
        const scope = effectScope(true);
        const root = document.createElement("div");
        const msg = useRef(`hello ${i}`);
        scope.run(() => {
          const node = document.createTextNode("");
          text(node, () => msg.value);
          root.appendChild(node);
        });
        document.body.appendChild(root);
        scope.stop();
        root.remove();
      }
    }
  }),
  listCreate: (count) => ({
    async run() {
      const scope = effectScope(true);
      const root = document.createElement("div");
      const anchor = mark("bench");
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
    }
  }),
  listSwap: (count) => {
    const scope = effectScope(true);
    const root = document.createElement("div");
    const anchor = mark("bench");
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
    return {
      async run() {
        items.value = swapEdges(items.value);
      },
      cleanup() {
        scope.stop();
        root.remove();
      }
    };
  },
  tableUpdate: (rows, cols) => {
    const scope = effectScope(true);
    const root = document.createElement("div");
    const table = document.createElement("table");
    const cells = makeTableRows(rows, cols).map((row) => row.map((value) => useRef(value)));
    scope.run(() => {
      for (const row of cells) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          const node = document.createTextNode("");
          text(node, () => cell.value);
          td.appendChild(node);
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
    });
    root.appendChild(table);
    document.body.appendChild(root);
    return {
      async run() {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            cells[row][col].set(`U${row}:C${col}`);
          }
        }
      },
      cleanup() {
        scope.stop();
        root.remove();
      }
    };
  },
  scrollEvents: () => {
    const scope = effectScope(true);
    const root = document.createElement("div");
    root.style.cssText = "height:120px;overflow:auto";
    const top = useRef(0);
    const label = document.createElement("span");
    scope.run(() => {
      text(label.appendChild(document.createTextNode("")), () => top.value);
    });
    root.addEventListener("scroll", () => top.set(root.scrollTop));
    for (let i = 0; i < 400; i++) {
      const row = document.createElement("div");
      row.textContent = `row ${i}`;
      root.appendChild(row);
    }
    document.body.append(label, root);
    return {
      async run() {
        for (let i = 0; i < 500; i++) {
          root.scrollTop = i;
          root.dispatchEvent(new window.Event("scroll"));
        }
      },
      cleanup() {
        scope.stop();
        label.remove();
        root.remove();
      }
    };
  }
});

const createVueAdapter = () => ({
  name: "Vue 3",
  version: versionOf("vue"),
  note: "runtime-dom h() render",
  helloMount: () => ({
    async run() {
      for (let i = 0; i < 200; i++) {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const msg = ref(`hello ${i}`);
        const app = createApp({ render: () => h("span", msg.value) });
        app.mount(root);
        app.unmount();
        root.remove();
      }
    }
  }),
  listCreate: (count) => ({
    async run() {
      const root = document.createElement("div");
      const items = ref(makeItems(count));
      const app = createApp({
        render: () =>
          h(
            "div",
            items.value.map((item) => h("div", { key: item.id }, item.label))
          )
      });
      document.body.appendChild(root);
      app.mount(root);
      app.unmount();
      root.remove();
    }
  }),
  listSwap: (count) => {
    const root = document.createElement("div");
    const items = ref(makeItems(count));
    const app = createApp({
      render: () =>
        h(
          "div",
          items.value.map((item) => h("div", { key: item.id }, item.label))
        )
    });
    document.body.appendChild(root);
    app.mount(root);
    return {
      async run() {
        items.value = swapEdges(items.value);
        await nextTick();
      },
      cleanup() {
        app.unmount();
        root.remove();
      }
    };
  },
  tableUpdate: (rows, cols) => {
    const root = document.createElement("div");
    const data = ref(makeTableRows(rows, cols));
    const app = createApp({
      render: () =>
        h(
          "table",
          data.value.map((row, rowIndex) =>
            h(
              "tr",
              { key: rowIndex },
              row.map((cell, colIndex) => h("td", { key: colIndex }, cell))
            )
          )
        )
    });
    document.body.appendChild(root);
    app.mount(root);
    return {
      async run() {
        data.value = makeTableRows(rows, cols, 1);
        await nextTick();
      },
      cleanup() {
        app.unmount();
        root.remove();
      }
    };
  },
  scrollEvents: () => {
    const root = document.createElement("div");
    const top = ref(0);
    const app = createApp({
      render: () =>
        h("div", [
          h("span", top.value),
          h(
            "div",
            {
              style: "height:120px;overflow:auto",
              onScroll: (event) => {
                top.value = event.currentTarget.scrollTop;
              }
            },
            Array.from({ length: 400 }, (_, i) => h("div", { key: i }, `row ${i}`))
          )
        ])
    });
    document.body.appendChild(root);
    app.mount(root);
    const scroller = root.querySelector("div div");
    return {
      async run() {
        for (let i = 0; i < 500; i++) {
          scroller.scrollTop = i;
          scroller.dispatchEvent(new window.Event("scroll"));
        }
        await nextTick();
      },
      cleanup() {
        app.unmount();
        root.remove();
      }
    };
  }
});

const createLitAdapter = () => ({
  name: "lit-html",
  version: versionOf("lit-html"),
  note: "lit-html render()",
  helloMount: () => ({
    async run() {
      for (let i = 0; i < 200; i++) {
        const root = document.createElement("div");
        document.body.appendChild(root);
        litRender(html`<span>${`hello ${i}`}</span>`, root);
        litRender(null, root);
        root.remove();
      }
    }
  }),
  listCreate: (count) => ({
    async run() {
      const root = document.createElement("div");
      const items = makeItems(count);
      document.body.appendChild(root);
      litRender(html`<div>${items.map((item) => html`<div>${item.label}</div>`)}</div>`, root);
      litRender(null, root);
      root.remove();
    }
  }),
  listSwap: (count) => {
    const root = document.createElement("div");
    let items = makeItems(count);
    const paint = () =>
      litRender(html`<div>${items.map((item) => html`<div>${item.label}</div>`)}</div>`, root);
    document.body.appendChild(root);
    paint();
    return {
      async run() {
        items = swapEdges(items);
        paint();
      },
      cleanup() {
        litRender(null, root);
        root.remove();
      }
    };
  },
  tableUpdate: (rows, cols) => {
    const root = document.createElement("div");
    let data = makeTableRows(rows, cols);
    const paint = () =>
      litRender(
        html`<table>
          ${data.map(
            (row) =>
              html`<tr>
                ${row.map((cell) => html`<td>${cell}</td>`)}
              </tr>`
          )}
        </table>`,
        root
      );
    document.body.appendChild(root);
    paint();
    return {
      async run() {
        data = makeTableRows(rows, cols, 1);
        paint();
      },
      cleanup() {
        litRender(null, root);
        root.remove();
      }
    };
  },
  scrollEvents: () => {
    const root = document.createElement("div");
    let top = 0;
    const onScroll = (event) => {
      top = event.currentTarget.scrollTop;
      paint();
    };
    const paint = () =>
      litRender(
        html`<div>
          <span>${top}</span>
          <div style="height:120px;overflow:auto" @scroll=${onScroll}>
            ${Array.from({ length: 400 }, (_, i) => html`<div>row ${i}</div>`)}
          </div>
        </div>`,
        root
      );
    document.body.appendChild(root);
    paint();
    const scroller = root.querySelector("div div");
    return {
      async run() {
        for (let i = 0; i < 500; i++) {
          scroller.scrollTop = i;
          scroller.dispatchEvent(new window.Event("scroll"));
        }
      },
      cleanup() {
        litRender(null, root);
        root.remove();
      }
    };
  }
});

const createSolidAdapter = () => ({
  name: "Solid",
  version: versionOf("solid-js"),
  note: "client fine-grained signals + direct DOM adapter",
  helloMount: () => ({
    async run() {
      for (let i = 0; i < 200; i++) {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const [msg] = createSignal(`hello ${i}`);
        const dispose = solidRender(() => {
          const span = document.createElement("span");
          createEffect(() => {
            span.textContent = msg();
          });
          return span;
        }, root);
        dispose();
        root.remove();
      }
    }
  }),
  listCreate: (count) => ({
    async run() {
      const root = document.createElement("div");
      document.body.appendChild(root);
      const [items] = createSignal(makeItems(count));
      const dispose = solidRender(() => {
        const wrap = document.createElement("div");
        for (const item of items()) {
          const row = document.createElement("div");
          row.textContent = item.label;
          wrap.appendChild(row);
        }
        return wrap;
      }, root);
      dispose();
      root.remove();
    }
  }),
  listSwap: (count) => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [items, setItems] = createSignal(makeItems(count));
    const dispose = solidRender(() => {
      const wrap = document.createElement("div");
      createEffect(() => {
        wrap.replaceChildren(
          ...items().map((item) => {
            const row = document.createElement("div");
            row.textContent = item.label;
            return row;
          })
        );
      });
      return wrap;
    }, root);
    return {
      async run() {
        setItems((current) => swapEdges(current));
      },
      cleanup() {
        dispose();
        root.remove();
      }
    };
  },
  tableUpdate: (rows, cols) => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const signals = makeTableRows(rows, cols).map((row) => row.map((value) => createSignal(value)));
    const dispose = solidRender(() => {
      const table = document.createElement("table");
      for (const row of signals) {
        const tr = document.createElement("tr");
        for (const [cell] of row) {
          const td = document.createElement("td");
          createEffect(() => {
            td.textContent = cell();
          });
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      return table;
    }, root);
    return {
      async run() {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            signals[row][col][1](`U${row}:C${col}`);
          }
        }
      },
      cleanup() {
        dispose();
        root.remove();
      }
    };
  },
  scrollEvents: () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const [top, setTop] = createSignal(0);
    const dispose = solidRender(() => {
      const wrap = document.createElement("div");
      const label = document.createElement("span");
      const scroller = document.createElement("div");
      scroller.style.cssText = "height:120px;overflow:auto";
      createEffect(() => {
        label.textContent = String(top());
      });
      scroller.addEventListener("scroll", () => setTop(scroller.scrollTop));
      for (let i = 0; i < 400; i++) {
        const row = document.createElement("div");
        row.textContent = `row ${i}`;
        scroller.appendChild(row);
      }
      wrap.append(label, scroller);
      return wrap;
    }, root);
    const scroller = root.querySelector("div div");
    return {
      async run() {
        for (let i = 0; i < 500; i++) {
          scroller.scrollTop = i;
          scroller.dispatchEvent(new window.Event("scroll"));
        }
      },
      cleanup() {
        dispose();
        root.remove();
      }
    };
  }
});

const adapters = [createElfAdapter(), createVueAdapter(), createLitAdapter(), createSolidAdapter()];

const scenarioMatrix = [
  ["hello mount x200", (adapter) => adapter.helloMount(), { iterations: 7 }],
  ["list create 1k", (adapter) => adapter.listCreate(1000), { iterations: 5 }],
  ["list create 10k", (adapter) => adapter.listCreate(10000), { iterations: 2, warmup: 0 }],
  ["list swap 1k", (adapter) => adapter.listSwap(1000), { iterations: 5 }],
  ["list swap 10k", (adapter) => adapter.listSwap(10000), { iterations: 2, warmup: 0 }],
  ["table update 500x8", (adapter) => adapter.tableUpdate(500, 8), { iterations: 5 }],
  ["scroll events x500", (adapter) => adapter.scrollEvents(), { iterations: 5 }]
];

const results = [];
for (const adapter of adapters) {
  for (const [label, factory, options] of scenarioMatrix) {
    const result = await measure(label, () => factory(adapter), options);
    results.push({
      framework: adapter.name,
      version: adapter.version,
      note: adapter.note,
      ...result
    });
    console.log(
      `${adapter.name.padEnd(9)} ${label.padEnd(20)} ${formatMs(result.median).padStart(10)}`
    );
  }
}

const measureMemoryRelease = async (adapter, rounds = 30, count = 1000) => {
  if (typeof globalThis.gc === "function") globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  for (let i = 0; i < rounds; i++) {
    const task = adapter.listCreate(count);
    await task.run();
    await task.cleanup?.();
    resetDom();
  }
  if (typeof globalThis.gc === "function") globalThis.gc();
  const after = process.memoryUsage().heapUsed;
  return {
    framework: adapter.name,
    version: adapter.version,
    note: adapter.note,
    label: `memory release ${count}x${rounds}`,
    median: performance.now() - startedAt,
    heapDeltaKb: (after - before) / 1024,
    gc: typeof globalThis.gc === "function"
  };
};

const memoryResults = [];
for (const adapter of adapters) {
  const result = await measureMemoryRelease(adapter);
  memoryResults.push(result);
  console.log(
    `${adapter.name.padEnd(9)} ${result.label.padEnd(20)} ${formatMs(result.median).padStart(10)} heapDelta=${result.heapDeltaKb.toFixed(1)} KB`
  );
}

const toTable = (rows) => {
  const header = "| Framework | Version | Scenario | Median | Min | Max | Note |";
  const sep = "| --- | ---: | --- | ---: | ---: | ---: | --- |";
  const body = rows.map(
    (row) =>
      `| ${row.framework} | ${row.version} | ${row.label} | ${formatMs(row.median)} | ${formatMs(
        row.min
      )} | ${formatMs(row.max)} | ${row.note} |`
  );
  return [header, sep, ...body].join("\n");
};

const memoryTable = (rows) => {
  const header = "| Framework | Version | Scenario | Duration | Heap Delta | GC |";
  const sep = "| --- | ---: | --- | ---: | ---: | --- |";
  const body = rows.map(
    (row) =>
      `| ${row.framework} | ${row.version} | ${row.label} | ${formatMs(row.median)} | ${row.heapDeltaKb.toFixed(
        1
      )} KB | ${row.gc ? "yes" : "no"} |`
  );
  return [header, sep, ...body].join("\n");
};

const bundleSizeBaseline = `## Bundle Size Snapshot

Current \`npm run size\` output after M4.15 cleanup. Historical diff is maintained in \`docs/SIZE-REPORT.md\`.

| Target | Raw | Min | Gzip | Budget |
| --- | ---: | ---: | ---: | ---: |
| \`elfui\` light | 76.16 KB | 29.38 KB | 9.71 KB | 10.5 KB |
| \`@elfui/chain\` | 150.42 KB | 62.03 KB | 19.96 KB | 20.5 KB |
| light + router | 96.71 KB | 39.03 KB | 12.88 KB | 13.5 KB |
| \`@elfui/runtime\` subpath | 88.32 KB | 35.85 KB | 12.29 KB | 12.5 KB |
| \`@elfui/reactivity\` | 38.76 KB | 12.97 KB | 3.98 KB | 4.0 KB |`;

const report = `# ElfUI Benchmark Report

> Generated by \`npm run benchmark\` on ${new Date().toISOString()}.

## Environment

- Node: ${process.version}
- Platform: ${process.platform} ${process.arch}
- DOM: jsdom ${versionOf("jsdom")}
- Iteration policy: warmup + median; lower is better.

## Scope

This is a local framework micro-benchmark, not an official js-framework-benchmark score. It uses one script and the same jsdom process for ElfUI, Vue 3, lit-html and Solid. Vue uses runtime \`h()\`, lit-html uses \`render()\`, ElfUI uses compiled runtime helpers, and Solid uses client fine-grained signals with a direct DOM adapter because JSX compilation is outside this repository benchmark harness. The lit-html list rows use ordinary mapped templates; keyed \`repeat()\` is intentionally left for a separate browser benchmark because the 10k jsdom run is too slow for this daily gate.

Vue Vapor is not listed as a numeric row because there is no stable public npm runtime adapter wired into this harness yet. The relevant comparison point for this report is the no-VNode/fine-grained direction; once Vue exposes a stable Vapor package or fixture, it should be added as another adapter rather than estimated.

## Results

${toTable(results)}

## Memory Release

${memoryTable(memoryResults)}

${bundleSizeBaseline}

## Reading The Numbers

- \`list create\` measures initial DOM creation.
- \`list swap\` measures edge reordering after an initial mount. ElfUI and Vue use keyed rows in this harness; lit-html uses ordinary mapped templates; Solid uses the direct DOM adapter described above.
- \`table update\` updates 500 x 8 visible cells.
- \`scroll events\` dispatches 500 scroll events and updates a visible scroll state label.
- Memory numbers are approximate even with explicit GC; use them as leak smoke data, not as absolute heap truth.
`;

if (reportPath) {
  await writeFile(reportPath, report, "utf8");
}

if (args.has("--json")) {
  console.log(JSON.stringify({ results, memoryResults }, null, 2));
}
