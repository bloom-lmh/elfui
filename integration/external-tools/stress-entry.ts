import { nothing, render as renderLit, html } from "lit-html";

import { defineCustomElement, onMounted, onUnmounted, useTemplateRef } from "@elfui/runtime";
import { setTemplateRef } from "@elfui/runtime/internal";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const flushUnmount = async (): Promise<void> => {
  await nextMicrotask();
  await nextMicrotask();
  await nextFrame();
};

const publish = (id: "result" | "error", payload: unknown): void => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.createElement("pre");
  output.id = id;
  output.dataset.json = encoded;
  document.body.replaceChildren(output);
};

const counts = {
  setups: 0,
  mounted: 0,
  unmounted: 0,
  moves: 0,
  intervalsCreated: 0,
  intervalsCleared: 0,
  observersCreated: 0,
  observersDisconnected: 0,
  listenersCreated: 0,
  listenersRemoved: 0,
  portalsCreated: 0,
  portalsRemoved: 0,
  canvasesCreated: 0,
  canvasesReleased: 0,
  externalTreesCreated: 0,
  externalTreesCleared: 0,
  activeIntervals: 0,
  activeObservers: 0,
  activeListeners: 0,
  activePortals: 0,
  activeCanvases: 0,
  activeExternalTrees: 0,
  observerCallbacks: 0,
  globalCallbacks: 0,
  timerCallbacks: 0,
  lateCallbacks: 0,
  clearedShadowRoots: 0
};

defineCustomElement({
  tag: "elf-external-resource-stress",
  setup: (_props, { host }) => {
    counts.setups++;
    const externalTarget = useTemplateRef<HTMLDivElement>("stress-external-root");
    const canvasRef = useTemplateRef<HTMLCanvasElement>("stress-canvas");
    let externalRoot: HTMLDivElement | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let portal: HTMLDivElement | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let listenerController: AbortController | null = null;
    let intervalId: number | null = null;
    let alive = false;

    const recordObserver = (): void => {
      if (alive) counts.observerCallbacks++;
      else counts.lateCallbacks++;
    };
    const recordGlobal = (): void => {
      if (alive) counts.globalCallbacks++;
      else counts.lateCallbacks++;
    };

    onMounted(() => {
      externalRoot = externalTarget.value;
      canvas = canvasRef.value;
      check(externalRoot?.isConnected, "stress external root was unavailable at mounted time");
      check(canvas?.isConnected, "stress canvas was unavailable at mounted time");
      if (!externalRoot || !canvas) throw new Error("stress DOM resources are unavailable");
      alive = true;
      counts.mounted++;

      renderLit(html`<button data-stress-external-tree>external</button>`, externalRoot);
      counts.externalTreesCreated++;
      counts.activeExternalTrees++;

      const context = canvas.getContext("2d");
      check(context, "stress Canvas 2D context is unavailable");
      context?.fillRect(0, 0, 8, 8);
      counts.canvasesCreated++;
      counts.activeCanvases++;

      mutationObserver = new MutationObserver(recordObserver);
      mutationObserver.observe(externalRoot, { attributes: true, subtree: true });
      resizeObserver = new ResizeObserver(recordObserver);
      resizeObserver.observe(canvas);
      counts.observersCreated += 2;
      counts.activeObservers += 2;

      listenerController = new AbortController();
      document.addEventListener("elf-stress-probe", recordGlobal, {
        signal: listenerController.signal
      });
      window.addEventListener("resize", recordGlobal, { signal: listenerController.signal });
      counts.listenersCreated += 2;
      counts.activeListeners += 2;

      intervalId = window.setInterval(() => {
        if (alive) counts.timerCallbacks++;
        else counts.lateCallbacks++;
      }, 5);
      counts.intervalsCreated++;
      counts.activeIntervals++;

      portal = document.createElement("div");
      portal.dataset.elfStressPortal = "";
      portal.textContent = host.dataset.iteration ?? "";
      document.body.appendChild(portal);
      counts.portalsCreated++;
      counts.activePortals++;
    });

    onUnmounted(() => {
      alive = false;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      mutationObserver = null;
      resizeObserver = null;
      counts.observersDisconnected += 2;
      counts.activeObservers -= 2;

      listenerController?.abort();
      listenerController = null;
      counts.listenersRemoved += 2;
      counts.activeListeners -= 2;

      if (intervalId !== null) window.clearInterval(intervalId);
      intervalId = null;
      counts.intervalsCleared++;
      counts.activeIntervals--;

      portal?.remove();
      portal = null;
      counts.portalsRemoved++;
      counts.activePortals--;

      if (externalRoot) renderLit(nothing, externalRoot);
      externalRoot = null;
      counts.externalTreesCleared++;
      counts.activeExternalTrees--;

      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      canvas = null;
      counts.canvasesReleased++;
      counts.activeCanvases--;
      counts.unmounted++;
    });

    return {};
  },
  render: (ctx) => {
    const container = document.createElement("div");
    const externalRoot = document.createElement("div");
    externalRoot.dataset.stressExternalRoot = "";
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    canvas.dataset.stressCanvas = "";
    container.append(externalRoot, canvas);
    setTemplateRef(ctx.host, "stress-external-root", externalRoot);
    setTemplateRef(ctx.host, "stress-canvas", canvas);
    return container;
  }
});

const runCycle = async (
  firstContainer: HTMLElement,
  secondContainer: HTMLElement,
  iteration: number
): Promise<void> => {
  const host = document.createElement("elf-external-resource-stress");
  host.dataset.iteration = String(iteration);
  firstContainer.appendChild(host);
  check(counts.mounted === iteration + 1, `stress mount count diverged at cycle ${iteration}`);

  secondContainer.appendChild(host);
  await nextMicrotask();
  check(counts.unmounted === iteration, `DOM move unmounted cycle ${iteration}`);
  counts.moves++;

  const externalRoot = host.shadowRoot?.querySelector<HTMLElement>("[data-stress-external-root]");
  externalRoot?.setAttribute("data-mutation", String(iteration));
  document.dispatchEvent(new Event("elf-stress-probe"));
  window.dispatchEvent(new Event("resize"));
  await nextMicrotask();

  host.remove();
  await flushUnmount();
  check(counts.unmounted === iteration + 1, `stress unmount count diverged at cycle ${iteration}`);
  check(
    host.shadowRoot?.childNodes.length === 0,
    `framework-owned Shadow DOM remained at cycle ${iteration}`
  );
  counts.clearedShadowRoots++;
};

const run = async () => {
  const firstContainer = document.body.appendChild(document.createElement("section"));
  const secondContainer = document.body.appendChild(document.createElement("section"));

  for (let iteration = 0; iteration < 100; iteration++) {
    await runCycle(firstContainer, secondContainer, iteration);
  }

  const callbacksBeforeResidueProbe =
    counts.observerCallbacks + counts.globalCallbacks + counts.timerCallbacks;
  document.dispatchEvent(new Event("elf-stress-probe"));
  window.dispatchEvent(new Event("resize"));
  await delay(30);
  await nextFrame();
  check(
    counts.observerCallbacks + counts.globalCallbacks + counts.timerCallbacks ===
      callbacksBeforeResidueProbe,
    "callbacks continued after the 100-cycle teardown"
  );
  check(counts.lateCallbacks === 0, "a disposed stress resource received a late callback");
  check(
    document.querySelector("[data-elf-stress-portal]") === null,
    "stress teardown left a global portal node"
  );
  check(firstContainer.childElementCount === 0, "first stress container retained a host");
  check(secondContainer.childElementCount === 0, "second stress container retained a host");

  const activeTotal =
    counts.activeIntervals +
    counts.activeObservers +
    counts.activeListeners +
    counts.activePortals +
    counts.activeCanvases +
    counts.activeExternalTrees;
  check(activeTotal === 0, "stress teardown retained active resources");
  check(counts.setups === 100 && counts.mounted === 100, "stress setup/mount total was incorrect");
  check(
    counts.unmounted === 100 && counts.moves === 100,
    "stress move/unmount total was incorrect"
  );
  check(
    counts.intervalsCreated === counts.intervalsCleared &&
      counts.observersCreated === counts.observersDisconnected &&
      counts.listenersCreated === counts.listenersRemoved &&
      counts.portalsCreated === counts.portalsRemoved &&
      counts.canvasesCreated === counts.canvasesReleased &&
      counts.externalTreesCreated === counts.externalTreesCleared,
    "stress resource create/destroy totals diverged"
  );

  return {
    cases: [
      {
        name: "100-cycle external resource stress/residue lifecycle",
        status: "passed" as const
      }
    ],
    stress: { ...counts, activeTotal },
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
