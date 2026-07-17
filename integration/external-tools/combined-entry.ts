import { nothing, render as renderLit, html } from "lit-html";

import { createApp } from "@elfui/core";
import { useEffect, useRef, type Ref } from "@elfui/reactivity";
import {
  defineCustomElement,
  defineExpose,
  onMounted,
  onUnmounted,
  useTemplateRef
} from "@elfui/runtime";
import { branch, list, mark, setTemplateRef } from "@elfui/runtime/internal";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const flushLifecycle = async (): Promise<void> => {
  await nextMicrotask();
  await nextMicrotask();
  await nextMicrotask();
  await nextFrame();
};

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt++) {
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

const lifecycle = {
  rootSetups: 0,
  rootMounted: 0,
  rootUnmounted: 0,
  resourcesCreated: 0,
  resourcesDestroyed: 0,
  externalRenders: 0,
  externalClicks: 0
};
const activeResources = new Set<HTMLElement>();

interface ExternalOwnerHost extends HTMLElement {
  label: string;
}

const createExternalOwner = (tag: string, shadow: "open" | false) =>
  defineCustomElement({
    tag,
    shadow,
    props: { label: { type: String, default: "" } },
    setup: (props, { host }) => {
      const target = useTemplateRef<HTMLDivElement>("combined-external-root");
      let externalRoot: HTMLDivElement | null = null;
      let currentLabel = "";

      const renderExternal = (): void => {
        const root = externalRoot;
        if (!root) return;
        renderLit(
          html`<button data-combined-external-action @click=${() => lifecycle.externalClicks++}>
            ${currentLabel}
          </button>`,
          root
        );
        lifecycle.externalRenders++;
      };

      useEffect(() => {
        currentLabel = String(props.label ?? "");
        renderExternal();
      });
      onMounted(() => {
        const mountedTarget = target.value;
        check(mountedTarget?.isConnected, `${tag} mounted without a connected external root`);
        if (!mountedTarget) throw new Error(`${tag} external root is unavailable`);
        externalRoot = mountedTarget;
        activeResources.add(host);
        lifecycle.resourcesCreated++;
        renderExternal();
      });
      onUnmounted(() => {
        if (externalRoot) renderLit(nothing, externalRoot);
        externalRoot = null;
        activeResources.delete(host);
        lifecycle.resourcesDestroyed++;
      });
      return {};
    },
    render: (ctx) => {
      const target = document.createElement("div");
      target.dataset.combinedExternalRoot = "";
      setTemplateRef(ctx.host, "combined-external-root", target);
      return target;
    }
  });

createExternalOwner("elf-combined-shadow-owner", "open");
createExternalOwner("elf-combined-light-owner", false);

interface RowItem {
  id: string;
  label: string;
}

interface CombinedRootHost extends HTMLElement {
  setCombinedValue(value: string): void;
  setBranchVisible(visible: boolean): void;
  replaceItems(items: RowItem[]): void;
}

const CombinedRoot = defineCustomElement({
  tag: "elf-external-combined-root",
  props: { delay: { type: Number, default: 0 } },
  setup: async (props) => {
    lifecycle.rootSetups++;
    const value = useRef("initial");
    const visible = useRef(true);
    const items = useRef<RowItem[]>([
      { id: "a", label: "A" },
      { id: "b", label: "B" }
    ]);

    defineExpose({
      setCombinedValue: (nextValue: string): void => {
        value.set(nextValue);
      },
      setBranchVisible: (nextVisible: boolean): void => {
        visible.set(nextVisible);
      },
      replaceItems: (nextItems: RowItem[]): void => {
        items.set(nextItems);
      }
    });
    onMounted(() => lifecycle.rootMounted++);
    onUnmounted(() => lifecycle.rootUnmounted++);

    await delay(Number(props.delay ?? 0));
    return { value, visible, items };
  },
  render: (ctx) => {
    if (ctx.state.$asyncPending) {
      const pending = document.createElement("span");
      pending.dataset.combinedPending = "";
      pending.textContent = "pending";
      return pending;
    }

    const value = ctx.state.value as Ref<string>;
    const visible = ctx.state.visible as Ref<boolean>;
    const items = ctx.state.items as Ref<RowItem[]>;
    const container = document.createElement("main");

    const shadowOwner = document.createElement("elf-combined-shadow-owner") as ExternalOwnerHost;
    shadowOwner.dataset.resourceKey = "shadow-main";
    const lightOwner = document.createElement("elf-combined-light-owner") as ExternalOwnerHost;
    lightOwner.dataset.resourceKey = "light-main";
    container.append(shadowOwner, lightOwner);
    useEffect(() => {
      shadowOwner.label = `shadow:${value.value}`;
      lightOwner.label = `light:${value.value}`;
    });

    const branchAnchor = container.appendChild(mark("combined-branch"));
    branch(branchAnchor, () => (visible.value ? 0 : -1), [
      () => {
        const owner = document.createElement("elf-combined-shadow-owner") as ExternalOwnerHost;
        owner.dataset.resourceKey = "branch";
        useEffect(() => {
          owner.label = `branch:${value.value}`;
        });
        return owner;
      }
    ]);

    const listAnchor = container.appendChild(mark("combined-list"));
    list(
      listAnchor,
      () => items.value,
      (item) => item.id,
      (item, index) => {
        const owner = document.createElement("elf-combined-shadow-owner") as ExternalOwnerHost;
        owner.dataset.resourceKey = `row-${item.value.id}`;
        useEffect(() => {
          owner.label = `${index.value}:${item.value.label}`;
        });
        return owner;
      }
    );

    return container;
  }
});

const readOwnerText = (owner: ExternalOwnerHost): string =>
  (
    owner.shadowRoot?.querySelector("[data-combined-external-action]")?.textContent ??
    owner.querySelector("[data-combined-external-action]")?.textContent ??
    ""
  ).trim();

const run = async () => {
  const firstTarget = document.body.appendChild(document.createElement("div"));
  firstTarget.id = "combined-app";
  const app = createApp(CombinedRoot, { delay: 10 });
  const root = app.mount(firstTarget) as CombinedRootHost;
  check(root.shadowRoot?.querySelector("[data-combined-pending]"), "async pending DOM missing");
  check(lifecycle.resourcesCreated === 0, "external resources initialized during async pending");

  await waitFor(
    () => lifecycle.rootMounted === 1 && lifecycle.resourcesCreated === 5,
    "combined async root and external resources did not mount"
  );
  check(
    root.shadowRoot?.querySelector("[data-combined-pending]") === null,
    "async pending DOM remained after final render"
  );
  const shadowMain = root.shadowRoot?.querySelector<ExternalOwnerHost>(
    '[data-resource-key="shadow-main"]'
  );
  const lightMain = root.shadowRoot?.querySelector<ExternalOwnerHost>(
    '[data-resource-key="light-main"]'
  );
  check(shadowMain?.shadowRoot, "Shadow DOM external owner did not create a shadow root");
  check(
    lightMain && lightMain.shadowRoot === null,
    "Light DOM external owner created a shadow root"
  );
  const initialShadowText = readOwnerText(shadowMain!);
  const initialLightText = readOwnerText(lightMain!);
  check(
    initialShadowText === "shadow:initial",
    `Shadow DOM external render failed: ${JSON.stringify(initialShadowText)}`
  );
  check(
    initialLightText === "light:initial",
    `Light DOM external render failed: ${JSON.stringify(initialLightText)}`
  );

  root.setCombinedValue("updated");
  check(readOwnerText(shadowMain!) === "shadow:updated", "property/state update missed Shadow DOM");
  check(readOwnerText(lightMain!) === "light:updated", "property/state update missed Light DOM");
  const branchOwner = root.shadowRoot?.querySelector<ExternalOwnerHost>(
    '[data-resource-key="branch"]'
  );
  check(readOwnerText(branchOwner!) === "branch:updated", "state update missed branch resource");
  shadowMain?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
  lightMain?.querySelector<HTMLButtonElement>("button")?.click();
  check(lifecycle.externalClicks === 2, "combined external events failed");

  const rowsBefore = new Map(
    [
      ...(root.shadowRoot?.querySelectorAll<ExternalOwnerHost>('[data-resource-key^="row-"]') ?? [])
    ].map((row) => [row.dataset.resourceKey, row])
  );
  root.replaceItems([
    { id: "b", label: "B2" },
    { id: "a", label: "A2" },
    { id: "c", label: "C" }
  ]);
  const rowsAfter = [
    ...(root.shadowRoot?.querySelectorAll<ExternalOwnerHost>('[data-resource-key^="row-"]') ?? [])
  ];
  check(rowsAfter.length === 3, "keyed list did not render three external owners");
  check(rowsAfter[0] === rowsBefore.get("row-b"), "keyed list did not reuse/move row B");
  check(rowsAfter[1] === rowsBefore.get("row-a"), "keyed list did not reuse/move row A");
  check(
    rowsAfter.map(readOwnerText).join("|") === "0:B2|1:A2|2:C",
    "keyed list item/index updates did not reach external owners"
  );
  check(lifecycle.resourcesCreated === 6, "keyed reuse recreated an existing resource");

  root.setBranchVisible(false);
  await flushLifecycle();
  check(lifecycle.resourcesDestroyed === 1, "branch removal did not destroy its external resource");
  root.setBranchVisible(true);
  await waitFor(
    () => lifecycle.resourcesCreated === 7,
    "branch recreation did not mount a fresh external resource"
  );

  app.unmount();
  await flushLifecycle();
  check(firstTarget.childElementCount === 0, "App unmount left root DOM in its target");
  check(activeResources.size === 0, "App unmount retained active external resources");
  check(
    lifecycle.resourcesCreated === lifecycle.resourcesDestroyed,
    "App unmount did not destroy every combined external resource"
  );

  const createdBeforePendingUnmount = lifecycle.resourcesCreated;
  const mountedBeforePendingUnmount = lifecycle.rootMounted;
  const secondTarget = document.body.appendChild(document.createElement("div"));
  const pendingApp = createApp(CombinedRoot, { delay: 80 });
  const pendingRoot = pendingApp.mount(secondTarget);
  check(
    pendingRoot.shadowRoot?.querySelector("[data-combined-pending]"),
    "second async root did not enter pending state"
  );
  pendingApp.unmount();
  await flushLifecycle();
  await delay(100);
  check(
    lifecycle.rootMounted === mountedBeforePendingUnmount,
    "unmounted async setup reported mounted after resolving"
  );
  check(
    lifecycle.resourcesCreated === createdBeforePendingUnmount,
    "unmounted async setup initialized external resources after resolving"
  );
  check(secondTarget.childElementCount === 0, "pending App unmount left root DOM");
  check(activeResources.size === 0, "pending App unmount retained resources");

  return {
    cases: [
      {
        name: "async/state/Shadow-Light/branch/keyed-list/App-unmount combination",
        status: "passed" as const
      }
    ],
    combined: { ...lifecycle, activeResources: activeResources.size },
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
