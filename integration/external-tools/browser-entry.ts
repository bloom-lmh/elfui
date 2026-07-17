import { html as litHtml, nothing, render as renderLit } from "lit-html";
import Chart from "chart.js/auto";

import {
  defineCustomElement,
  defineExpose,
  onMounted,
  onUnmounted,
  useResizeObserver,
  useTemplateRef
} from "@elfui/runtime";
import { setTemplateRef } from "@elfui/runtime/internal";

interface IntegrationReport {
  cases: Array<{ name: string; status: "passed" }>;
  lifecycle: {
    setup: number;
    mounted: number;
    disposed: number;
    clicks: number;
  };
  chart: {
    created: number;
    destroyed: number;
    resized: number;
    updates: number;
  };
  userAgent: string;
}

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await nextFrame();
  }
  throw new Error(message);
};

const publish = (id: "result" | "error", payload: unknown): void => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.createElement("pre");
  output.id = id;
  output.dataset.json = encoded;
  document.body.replaceChildren(output);
};

const lifecycle = { setup: 0, mounted: 0, disposed: 0, clicks: 0 };
const chartLifecycle = { created: 0, destroyed: 0, resized: 0, updates: 0 };

defineCustomElement({
  tag: "elf-external-lit-html",
  setup: () => {
    lifecycle.setup++;
    const target = useTemplateRef<HTMLDivElement>("external-root");
    let externalRoot: HTMLDivElement | null = null;
    let value = 0;

    const renderExternalTree = (): void => {
      const root = externalRoot;
      if (!root) throw new Error("lit-html root is unavailable");
      renderLit(
        litHtml`<button
          data-external-action
          @click=${() => {
            lifecycle.clicks++;
            value++;
            renderExternalTree();
          }}
        >${value}</button>`,
        root
      );
    };

    onMounted(() => {
      const mountedTarget = target.value;
      check(mountedTarget?.isConnected, "onMounted did not receive the connected template ref");
      if (!mountedTarget) throw new Error("mounted template ref is unavailable");
      externalRoot = mountedTarget;
      lifecycle.mounted++;
      renderExternalTree();
    });

    onUnmounted(() => {
      if (externalRoot) renderLit(nothing, externalRoot);
      externalRoot = null;
      lifecycle.disposed++;
    });

    return {};
  },
  render: (ctx) => {
    const target = document.createElement("div");
    target.dataset.externalRoot = "";
    setTemplateRef(ctx.host, "external-root", target);
    return target;
  }
});

interface ChartIntegrationHost extends HTMLElement {
  setChartValue(value: number): void;
  getChartSnapshot(): { width: number; height: number; value: number } | null;
}

defineCustomElement({
  tag: "elf-external-chart-js",
  setup: () => {
    const container = useTemplateRef<HTMLDivElement>("chart-container");
    const canvas = useTemplateRef<HTMLCanvasElement>("chart-canvas");
    let chart: Chart<"bar"> | null = null;

    useResizeObserver(container, ({ width, height }) => {
      if (!chart || width <= 0 || height <= 0) return;
      chart.resize(Math.round(width), Math.round(height));
      chartLifecycle.resized++;
    });

    defineExpose({
      setChartValue: (value: number): void => {
        if (!chart) throw new Error("Chart.js instance is unavailable");
        chart.data.datasets[0]!.data = [value, value + 1, value + 2];
        chart.update("none");
        chartLifecycle.updates++;
      },
      getChartSnapshot: (): { width: number; height: number; value: number } | null =>
        chart
          ? {
              width: chart.width,
              height: chart.height,
              value: Number(chart.data.datasets[0]!.data[0])
            }
          : null
    });

    onMounted(() => {
      const target = canvas.value;
      check(target?.isConnected, "Chart.js canvas ref was unavailable at mounted time");
      if (!target) throw new Error("Chart.js canvas is unavailable");
      chart = new Chart(target, {
        type: "bar",
        data: {
          labels: ["A", "B", "C"],
          datasets: [{ label: "ElfUI", data: [1, 2, 3] }]
        },
        options: {
          animation: false,
          responsive: false,
          maintainAspectRatio: false
        },
        plugins: [
          {
            id: "elfui-integration-lifecycle",
            afterDestroy: () => chartLifecycle.destroyed++
          }
        ]
      });
      chartLifecycle.created++;
    });

    onUnmounted(() => {
      chart?.destroy();
      chart = null;
    });

    return {};
  },
  render: (ctx) => {
    const container = document.createElement("div");
    container.dataset.chartContainer = "";
    container.style.cssText = "position:relative;width:320px;height:180px";
    const canvas = document.createElement("canvas");
    canvas.dataset.chartCanvas = "";
    canvas.width = 320;
    canvas.height = 180;
    container.appendChild(canvas);
    setTemplateRef(ctx.host, "chart-container", container);
    setTemplateRef(ctx.host, "chart-canvas", canvas);
    return container;
  }
});

const run = async (): Promise<IntegrationReport> => {
  const firstContainer = document.createElement("section");
  const secondContainer = document.createElement("section");
  document.body.append(firstContainer, secondContainer);

  const host = document.createElement("elf-external-lit-html");
  firstContainer.appendChild(host);

  const firstButton = host.shadowRoot?.querySelector<HTMLButtonElement>("[data-external-action]");
  check(firstButton?.textContent === "0", "lit-html did not initialize after ElfUI mounted");
  if (!firstButton) throw new Error("first external button is unavailable");
  firstButton.click();
  check(firstButton.textContent === "1", "lit-html event/update integration failed");

  secondContainer.appendChild(host);
  await nextMicrotask();
  check(lifecycle.setup === 1, "synchronous DOM move repeated ElfUI setup");
  check(lifecycle.mounted === 1, "synchronous DOM move repeated mounted initialization");
  check(lifecycle.disposed === 0, "synchronous DOM move disposed the external tool");
  check(firstButton.isConnected, "synchronous DOM move replaced the external DOM tree");

  const firstExternalRoot = host.shadowRoot?.querySelector<HTMLDivElement>("[data-external-root]");
  host.remove();
  await nextMicrotask();
  check(lifecycle.disposed === 1, "full disconnect did not dispose the external tool exactly once");
  check(
    firstExternalRoot?.querySelector("[data-external-action]") === null &&
      firstExternalRoot?.textContent === "",
    "external DOM tree remained after unmount"
  );

  secondContainer.appendChild(host);
  const secondButton = host.shadowRoot?.querySelector<HTMLButtonElement>("[data-external-action]");
  check(lifecycle.setup === 2, "reconnect did not create a fresh ElfUI setup");
  check(lifecycle.mounted === 2, "reconnect did not initialize the external tool again");
  check(secondButton?.textContent === "0", "reconnect reused stale external tool state");
  if (!secondButton) throw new Error("reconnected external button is unavailable");
  secondButton.click();
  check(secondButton.textContent === "1", "external tool stopped updating after reconnect");

  host.remove();
  await nextMicrotask();
  check(lifecycle.disposed === 2, "final unmount did not dispose the reconnected tool");

  const chartHost = document.createElement("elf-external-chart-js") as ChartIntegrationHost;
  document.body.appendChild(chartHost);
  await waitFor(
    () => chartHost.getChartSnapshot()?.width === 320,
    "Chart.js did not initialize at the mounted container width"
  );
  const firstChartCanvas =
    chartHost.shadowRoot?.querySelector<HTMLCanvasElement>("[data-chart-canvas]");
  check(firstChartCanvas && Chart.getChart(firstChartCanvas), "Chart.js did not own the canvas");

  chartHost.setChartValue(7);
  check(chartHost.getChartSnapshot()?.value === 7, "Chart.js data update failed inside ElfUI");

  const chartContainer =
    chartHost.shadowRoot?.querySelector<HTMLDivElement>("[data-chart-container]");
  if (!chartContainer) throw new Error("Chart.js container is unavailable");
  chartContainer.style.width = "480px";
  chartContainer.style.height = "240px";
  await waitFor(() => {
    const snapshot = chartHost.getChartSnapshot();
    return snapshot?.width === 480 && snapshot.height === 240;
  }, "ResizeObserver did not resize Chart.js with its ElfUI container");

  chartHost.remove();
  await nextMicrotask();
  check(chartLifecycle.destroyed === 1, "Chart.js destroy was not called on ElfUI unmount");
  check(
    firstChartCanvas ? Chart.getChart(firstChartCanvas) === undefined : false,
    "Chart.js retained the detached canvas after destroy"
  );

  document.body.appendChild(chartHost);
  await waitFor(
    () => chartLifecycle.created === 2 && chartHost.getChartSnapshot()?.width === 320,
    "Chart.js did not create a fresh instance after reconnect"
  );
  chartHost.remove();
  await nextMicrotask();
  check(chartLifecycle.destroyed === 2, "reconnected Chart.js instance was not destroyed");

  return {
    cases: [
      { name: "lit-html DOM ownership lifecycle", status: "passed" },
      { name: "Chart.js canvas resize/update/destroy lifecycle", status: "passed" }
    ],
    lifecycle: { ...lifecycle },
    chart: { ...chartLifecycle },
    userAgent: navigator.userAgent
  };
};

void run().then(
  (report) => publish("result", report),
  (error: unknown) =>
    publish("error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : ""
    })
);
