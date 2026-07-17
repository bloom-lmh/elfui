import { useRef, type Ref } from "@elfui/reactivity";
import {
  defineCustomElement,
  defineExpose,
  keepAlive,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  useTemplateRef
} from "@elfui/runtime";
import { branch, mark, setTemplateRef } from "@elfui/runtime/internal";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const flushLifecycle = async (): Promise<void> => {
  await nextMicrotask();
  await nextMicrotask();
  await nextFrame();
};

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

interface ResourceCounts {
  mounted: number;
  activated: number;
  deactivated: number;
  unmounted: number;
  starts: number;
  stops: number;
  mutations: number;
  resizes: number;
  intersections: number;
  globalEvents: number;
}

const countsByKey = new Map<string, ResourceCounts>();
const getCounts = (key: string): ResourceCounts => {
  let counts = countsByKey.get(key);
  if (!counts) {
    counts = {
      mounted: 0,
      activated: 0,
      deactivated: 0,
      unmounted: 0,
      starts: 0,
      stops: 0,
      mutations: 0,
      resizes: 0,
      intersections: 0,
      globalEvents: 0
    };
    countsByKey.set(key, counts);
  }
  return counts;
};

interface ObserverChildHost extends HTMLElement {
  triggerResources(): void;
}

defineCustomElement({
  tag: "elf-external-observer-child",
  setup: (_props, { host }) => {
    const key = host.dataset.resourceKey;
    if (!key) throw new Error("observer integration child requires a resource key");
    const counts = getCounts(key);
    const target = useTemplateRef<HTMLDivElement>("observer-target");
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let listenerController: AbortController | null = null;
    let active = false;
    let epoch = 0;
    let triggerIndex = 0;

    const start = (): void => {
      const element = target.value;
      if (active || !element?.isConnected) return;
      active = true;
      const currentEpoch = ++epoch;
      const acceptsCallback = (): boolean => active && epoch === currentEpoch;

      mutationObserver = new MutationObserver((entries) => {
        if (acceptsCallback()) counts.mutations += entries.length;
      });
      mutationObserver.observe(element, { attributes: true });

      resizeObserver = new ResizeObserver((entries) => {
        if (acceptsCallback()) counts.resizes += entries.length;
      });
      resizeObserver.observe(element);

      intersectionObserver = new IntersectionObserver((entries) => {
        if (acceptsCallback()) counts.intersections += entries.length;
      });
      intersectionObserver.observe(element);

      listenerController = new AbortController();
      const onGlobalEvent = (): void => {
        if (acceptsCallback()) counts.globalEvents++;
      };
      window.addEventListener("resize", onGlobalEvent, { signal: listenerController.signal });
      document.addEventListener("elf-observer-probe", onGlobalEvent, {
        signal: listenerController.signal
      });
      counts.starts++;
    };

    const stop = (): void => {
      if (!active) return;
      active = false;
      epoch++;
      mutationObserver?.disconnect();
      mutationObserver = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      listenerController?.abort();
      listenerController = null;
      counts.stops++;
    };

    defineExpose({
      triggerResources: (): void => {
        const element = target.value;
        if (!active || !element) throw new Error(`observer resources for ${key} are inactive`);
        triggerIndex++;
        element.dataset.probe = String(triggerIndex);
        element.style.width = `${100 + triggerIndex * 11}px`;
        document.dispatchEvent(new Event("elf-observer-probe"));
        window.dispatchEvent(new Event("resize"));
      }
    });

    onMounted(() => {
      counts.mounted++;
      start();
    });
    onActivated(() => {
      counts.activated++;
      start();
    });
    onDeactivated(() => {
      counts.deactivated++;
      stop();
    });
    onUnmounted(() => {
      stop();
      counts.unmounted++;
    });

    return {};
  },
  render: (ctx) => {
    const target = document.createElement("div");
    target.dataset.observerTarget = "";
    target.style.cssText = "display:block;width:100px;height:20px";
    setTemplateRef(ctx.host, "observer-target", target);
    return target;
  }
});

interface BranchHost extends HTMLElement {
  setBranchVisible(visible: boolean): void;
  getBranchChild(): ObserverChildHost | null;
}

defineCustomElement({
  tag: "elf-external-observer-branch",
  setup: (_props, { host }) => {
    const visible = useRef(true);
    defineExpose({
      setBranchVisible: (nextVisible: boolean): void => {
        visible.set(nextVisible);
      },
      getBranchChild: (): ObserverChildHost | null =>
        host.shadowRoot?.querySelector<ObserverChildHost>("elf-external-observer-child") ?? null
    });
    return { visible };
  },
  render: (ctx) => {
    const container = document.createElement("div");
    const anchor = mark("observer-branch");
    container.appendChild(anchor);
    branch(anchor, () => ((ctx.state.visible as Ref<boolean>).value ? 0 : -1), [
      () => {
        const child = document.createElement("elf-external-observer-child");
        child.dataset.resourceKey = `branch-${getCounts("branch-1").mounted + 1}`;
        return child;
      }
    ]);
    return container;
  }
});

interface KeepAliveHost extends HTMLElement {
  setResourceKey(key: string): void;
  getActiveChild(): ObserverChildHost | null;
}

defineCustomElement({
  tag: "elf-external-observer-keep-alive",
  setup: (_props, { host }) => {
    const key = useRef("keep-a");
    defineExpose({
      setResourceKey: (nextKey: string): void => {
        key.set(nextKey);
      },
      getActiveChild: (): ObserverChildHost | null =>
        host.shadowRoot?.querySelector<ObserverChildHost>("elf-external-observer-child") ?? null
    });
    return { key };
  },
  render: (ctx) => {
    const container = document.createElement("div");
    container.appendChild(
      keepAlive(
        () => (ctx.state.key as Ref<string>).value,
        (key) => {
          const child = document.createElement("elf-external-observer-child");
          child.dataset.resourceKey = key;
          return child;
        },
        { max: 2 }
      )
    );
    return container;
  }
});

const assertNativeCallbacks = async (key: string, child: ObserverChildHost): Promise<void> => {
  const before = { ...getCounts(key) };
  child.triggerResources();
  await waitFor(() => {
    const current = getCounts(key);
    return (
      current.mutations > before.mutations &&
      current.resizes > before.resizes &&
      current.intersections > 0 &&
      current.globalEvents >= before.globalEvents + 2
    );
  }, `native observer/global listener callbacks did not complete for ${key}`);
};

const assertInactive = async (key: string, detachedChild: ObserverChildHost): Promise<void> => {
  const before = { ...getCounts(key) };
  const target = detachedChild.shadowRoot?.querySelector<HTMLElement>("[data-observer-target]");
  if (target) {
    target.dataset.lateMutation = "ignored";
    target.style.width = "333px";
  }
  document.dispatchEvent(new Event("elf-observer-probe"));
  window.dispatchEvent(new Event("resize"));
  await nextMicrotask();
  await nextFrame();
  const after = getCounts(key);
  check(after.mutations === before.mutations, `${key} received a late MutationObserver callback`);
  check(after.resizes === before.resizes, `${key} received a late ResizeObserver callback`);
  check(
    after.intersections === before.intersections,
    `${key} received a late IntersectionObserver callback`
  );
  check(after.globalEvents === before.globalEvents, `${key} retained a global event listener`);
};

const run = async () => {
  const branchHost = document.createElement("elf-external-observer-branch") as BranchHost;
  document.body.appendChild(branchHost);
  await flushLifecycle();
  const firstBranchChild = branchHost.getBranchChild();
  check(firstBranchChild, "branch observer child did not mount");
  await assertNativeCallbacks("branch-1", firstBranchChild!);

  branchHost.setBranchVisible(false);
  await flushLifecycle();
  check(getCounts("branch-1").unmounted === 1, "branch removal did not unmount observers");
  check(getCounts("branch-1").stops === 1, "branch removal did not stop observer resources");
  await assertInactive("branch-1", firstBranchChild!);

  branchHost.setBranchVisible(true);
  await flushLifecycle();
  const secondBranchChild = branchHost.getBranchChild();
  check(
    secondBranchChild && secondBranchChild !== firstBranchChild,
    "branch did not create a fresh child"
  );
  await assertNativeCallbacks("branch-2", secondBranchChild!);
  branchHost.remove();
  await flushLifecycle();
  check(getCounts("branch-2").unmounted === 1, "branch host teardown did not unmount its child");
  await assertInactive("branch-2", secondBranchChild!);

  const keepAliveHost = document.createElement("elf-external-observer-keep-alive") as KeepAliveHost;
  document.body.appendChild(keepAliveHost);
  await flushLifecycle();
  const keepA = keepAliveHost.getActiveChild();
  check(keepA, "KeepAlive A child did not mount");
  await assertNativeCallbacks("keep-a", keepA!);

  keepAliveHost.setResourceKey("keep-b");
  await flushLifecycle();
  check(getCounts("keep-a").deactivated === 1, "KeepAlive A did not deactivate");
  check(getCounts("keep-a").stops === 1, "KeepAlive A resources were not paused");
  await assertInactive("keep-a", keepA!);
  const keepB = keepAliveHost.getActiveChild();
  check(keepB && keepB !== keepA, "KeepAlive B child did not activate");
  await assertNativeCallbacks("keep-b", keepB!);

  keepAliveHost.setResourceKey("keep-a");
  await flushLifecycle();
  check(keepAliveHost.getActiveChild() === keepA, "KeepAlive did not reuse the cached A child");
  check(getCounts("keep-a").starts === 2, "KeepAlive A resources did not resume once");
  await assertNativeCallbacks("keep-a", keepA!);

  keepAliveHost.remove();
  await flushLifecycle();
  check(getCounts("keep-a").unmounted === 1, "active KeepAlive child did not unmount");
  check(getCounts("keep-b").unmounted === 1, "cached KeepAlive child did not unmount");
  await assertInactive("keep-a", keepA!);
  await assertInactive("keep-b", keepB!);

  return {
    cases: [
      {
        name: "native observers/global listeners across branch and KeepAlive lifecycle",
        status: "passed" as const
      }
    ],
    resources: Object.fromEntries(countsByKey),
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
