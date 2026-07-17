import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";

import {
  defineCustomElement,
  defineExpose,
  onMounted,
  onUnmounted,
  useTemplateRef
} from "@elfui/runtime";
import { setTemplateRef } from "@elfui/runtime/internal";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 30; attempt++) {
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

const PORTAL_ROOT_ATTRIBUTE = "data-elfui-integration-overlay-root";

const lifecycle = {
  created: 0,
  destroyed: 0,
  cleanups: 0,
  positionUpdates: 0,
  overlayClicks: 0,
  bridgedEvents: 0,
  documentClicks: 0
};

interface OverlaySnapshot {
  id: string;
  positioned: boolean;
  x: number;
  y: number;
  connected: boolean;
  inGlobalPortal: boolean;
}

interface OverlayIntegrationHost extends HTMLElement {
  getOverlaySnapshot(): OverlaySnapshot | null;
  requestOverlayUpdate(): void;
}

const ensurePortalRoot = (): HTMLDivElement => {
  const existing = document.querySelector<HTMLDivElement>(`[${PORTAL_ROOT_ATTRIBUTE}]`);
  if (existing) return existing;
  const root = document.createElement("div");
  root.setAttribute(PORTAL_ROOT_ATTRIBUTE, "");
  root.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:none";
  document.body.appendChild(root);
  return root;
};

defineCustomElement({
  tag: "elf-external-floating-ui",
  setup: (_props, { host }) => {
    const anchor = useTemplateRef<HTMLButtonElement>("overlay-anchor");
    let overlay: HTMLButtonElement | null = null;
    let stopAutoUpdate: (() => void) | null = null;
    let listenerController: AbortController | null = null;
    let generation = 0;

    const updatePosition = (): void => {
      const reference = anchor.value;
      const floating = overlay;
      const currentGeneration = generation;
      if (!reference || !floating) return;

      void computePosition(reference, floating, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(8), flip(), shift({ padding: 4 })]
      }).then(({ x, y }) => {
        if (
          currentGeneration !== generation ||
          floating !== overlay ||
          !reference.isConnected ||
          !floating.isConnected
        ) {
          return;
        }
        floating.style.left = `${x}px`;
        floating.style.top = `${y}px`;
        floating.dataset.positioned = "";
        lifecycle.positionUpdates++;
      });
    };

    defineExpose({
      getOverlaySnapshot: (): OverlaySnapshot | null => {
        const current = overlay;
        if (!current) return null;
        return {
          id: current.id,
          positioned: current.hasAttribute("data-positioned"),
          x: Number.parseFloat(current.style.left),
          y: Number.parseFloat(current.style.top),
          connected: current.isConnected,
          inGlobalPortal: current.parentElement?.hasAttribute(PORTAL_ROOT_ATTRIBUTE) ?? false
        };
      },
      requestOverlayUpdate: updatePosition
    });

    onMounted(() => {
      const reference = anchor.value;
      check(reference?.isConnected, "Floating UI anchor ref was unavailable at mounted time");
      if (!reference) throw new Error("Floating UI anchor is unavailable");

      generation++;
      const portalRoot = ensurePortalRoot();
      const floating = document.createElement("button");
      floating.id = `elf-floating-overlay-${lifecycle.created + 1}`;
      floating.type = "button";
      floating.textContent = "Global overlay action";
      floating.style.cssText =
        "position:fixed;width:max-content;pointer-events:auto;padding:6px;border:1px solid #888";
      listenerController = new AbortController();
      floating.addEventListener(
        "click",
        () => {
          lifecycle.overlayClicks++;
          host.dispatchEvent(
            new CustomEvent("overlay-action", {
              detail: { overlayId: floating.id },
              bubbles: true,
              composed: true
            })
          );
        },
        { signal: listenerController.signal }
      );
      portalRoot.appendChild(floating);
      overlay = floating;
      lifecycle.created++;

      stopAutoUpdate = autoUpdate(reference, floating, updatePosition, {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true
      });
    });

    onUnmounted(() => {
      generation++;
      stopAutoUpdate?.();
      stopAutoUpdate = null;
      lifecycle.cleanups++;
      listenerController?.abort();
      listenerController = null;
      const portalRoot = overlay?.parentElement;
      overlay?.remove();
      overlay = null;
      if (portalRoot?.hasAttribute(PORTAL_ROOT_ATTRIBUTE) && portalRoot.childElementCount === 0) {
        portalRoot.remove();
      }
      lifecycle.destroyed++;
    });

    return {};
  },
  render: (ctx) => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:block;padding:24px";
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.dataset.overlayAnchor = "";
    anchor.textContent = "Shadow DOM anchor";
    anchor.style.cssText = "display:block;width:160px;height:32px";
    wrapper.appendChild(anchor);
    setTemplateRef(ctx.host, "overlay-anchor", anchor);
    return wrapper;
  }
});

const run = async () => {
  const firstContainer = document.createElement("section");
  const secondContainer = document.createElement("section");
  document.body.append(firstContainer, secondContainer);

  let latestBridgedOverlayId = "";
  const host = document.createElement("elf-external-floating-ui") as OverlayIntegrationHost;
  host.addEventListener("overlay-action", (event) => {
    lifecycle.bridgedEvents++;
    latestBridgedOverlayId = (event as CustomEvent<{ overlayId: string }>).detail.overlayId;
  });
  const onDocumentClick = (event: MouseEvent): void => {
    if ((event.target as Element | null)?.closest(`[${PORTAL_ROOT_ATTRIBUTE}]`)) {
      lifecycle.documentClicks++;
      check(
        event.composedPath()[0] instanceof HTMLButtonElement,
        "global overlay click produced an invalid composed path"
      );
    }
  };
  document.addEventListener("click", onDocumentClick);

  firstContainer.appendChild(host);
  await waitFor(
    () => host.getOverlaySnapshot()?.positioned === true,
    "Floating UI did not position the portal from a Shadow DOM anchor"
  );
  const firstSnapshot = host.getOverlaySnapshot();
  check(firstSnapshot?.connected, "Floating UI overlay was not connected");
  check(firstSnapshot?.inGlobalPortal, "overlay was not mounted into the global portal root");
  check(
    Number.isFinite(firstSnapshot?.x) && Number.isFinite(firstSnapshot?.y),
    "Floating UI produced non-finite coordinates"
  );
  const firstOverlay = document.getElementById(firstSnapshot?.id ?? "") as HTMLButtonElement | null;
  check(firstOverlay, "global overlay element is unavailable");
  firstOverlay?.click();
  check(lifecycle.overlayClicks === 1, "overlay-local click handler did not run");
  check(lifecycle.documentClicks === 1, "global overlay click did not bubble through document");
  check(
    lifecycle.bridgedEvents === 1 && latestBridgedOverlayId === firstSnapshot?.id,
    "overlay action was not bridged through the ElfUI host"
  );

  secondContainer.appendChild(host);
  await nextMicrotask();
  check(lifecycle.created === 1, "synchronous DOM move recreated the Floating UI overlay");
  check(lifecycle.destroyed === 0, "synchronous DOM move disposed the Floating UI overlay");
  check(firstOverlay?.isConnected, "synchronous DOM move detached the global overlay");

  await nextFrame();
  host.remove();
  await nextMicrotask();
  await nextFrame();
  const updatesAfterUnmount = lifecycle.positionUpdates;
  check(lifecycle.destroyed === 1, "full disconnect did not destroy the Floating UI overlay");
  check(lifecycle.cleanups === 1, "Floating UI autoUpdate cleanup did not run exactly once");
  check(!firstOverlay?.isConnected, "Floating UI overlay remained connected after unmount");
  check(
    document.querySelector(`[${PORTAL_ROOT_ATTRIBUTE}]`) === null,
    "empty global portal root remained after unmount"
  );
  firstOverlay?.click();
  check(lifecycle.overlayClicks === 1, "detached overlay retained its local event listener");
  window.dispatchEvent(new Event("resize"));
  await nextFrame();
  await nextFrame();
  check(
    lifecycle.positionUpdates === updatesAfterUnmount,
    "Floating UI autoUpdate listener remained active after unmount"
  );

  secondContainer.appendChild(host);
  await waitFor(
    () => lifecycle.created === 2 && host.getOverlaySnapshot()?.positioned === true,
    "Floating UI did not create and position a fresh overlay after reconnect"
  );
  const secondSnapshot = host.getOverlaySnapshot();
  check(secondSnapshot?.id !== firstSnapshot?.id, "reconnect reused the stale overlay instance");
  const secondOverlay = document.getElementById(
    secondSnapshot?.id ?? ""
  ) as HTMLButtonElement | null;
  secondOverlay?.click();
  check(lifecycle.overlayClicks === 2, "reconnected overlay click handler did not run");
  check(lifecycle.bridgedEvents === 2, "reconnected overlay did not bridge its action event");

  host.requestOverlayUpdate();
  await waitFor(
    () => lifecycle.positionUpdates > updatesAfterUnmount + 1,
    "explicit Floating UI update did not complete after reconnect"
  );
  host.remove();
  await nextMicrotask();
  check(lifecycle.destroyed === 2, "reconnected Floating UI overlay was not destroyed");
  check(lifecycle.cleanups === 2, "reconnected Floating UI cleanup did not run");
  check(
    document.querySelector(`[${PORTAL_ROOT_ATTRIBUTE}]`) === null,
    "global portal root remained after final teardown"
  );
  document.removeEventListener("click", onDocumentClick);

  return {
    cases: [
      {
        name: "Floating UI Shadow DOM portal positioning/events/cleanup lifecycle",
        status: "passed" as const
      }
    ],
    overlay: { ...lifecycle },
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
