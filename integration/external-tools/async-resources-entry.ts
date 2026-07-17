import {
  defineCustomElement,
  defineExpose,
  onErrorCaptured,
  onMounted,
  onUnmounted
} from "@elfui/runtime";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (predicate: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt++) {
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

const wasmAddModule = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01,
  0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09,
  0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b
]);

const workerSource = `
self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "boot") {
    setTimeout(() => self.postMessage({ type: "ready", generation: message.generation }), message.delay);
    return;
  }
  if (message.type === "compute") {
    setTimeout(() => self.postMessage({ type: "result", id: message.id, value: message.left + message.right }), 0);
  }
};
`;

const lifecycle = {
  initializations: 0,
  ready: 0,
  cancelled: 0,
  workerCreated: 0,
  workerTerminated: 0,
  wasmCreated: 0,
  computations: 0,
  asyncErrorsCaptured: 0,
  lateMessages: 0
};

class InitializationCancelled extends Error {}

interface WorkerHandle {
  worker: Worker;
  url: string;
}

interface CommittedResources extends WorkerHandle {
  generation: number;
  label: string;
  add(left: number, right: number): number;
  pendingComputations: Map<number, { resolve(value: number): void; reject(error: Error): void }>;
}

interface AsyncResourceHost extends HTMLElement {
  startInitialization(label: string, initDelay: number, workerDelay: number): Promise<void>;
  compute(left: number, right: number): Promise<number>;
  getResourceSnapshot(): { label: string; generation: number } | null;
}

defineCustomElement({
  tag: "elf-external-async-resources",
  setup: () => {
    let generation = 0;
    let requestId = 0;
    let resources: CommittedResources | null = null;
    const pendingInitializations = new Map<number, () => void>();

    const terminate = (handle: WorkerHandle): void => {
      handle.worker.terminate();
      URL.revokeObjectURL(handle.url);
      lifecycle.workerTerminated++;
    };

    const disposeCommitted = (): void => {
      const current = resources;
      if (!current) return;
      resources = null;
      for (const pending of current.pendingComputations.values()) {
        pending.reject(new InitializationCancelled("worker was disposed"));
      }
      current.pendingComputations.clear();
      terminate(current);
    };

    const cancelPending = (): void => {
      for (const cancel of [...pendingInitializations.values()]) cancel();
      pendingInitializations.clear();
    };

    const bootWorker = (currentGeneration: number, workerDelay: number): Promise<WorkerHandle> =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
        const worker = new Worker(url);
        lifecycle.workerCreated++;
        let settled = false;

        const removePending = (): void => {
          pendingInitializations.delete(currentGeneration);
          worker.onmessage = null;
          worker.onerror = null;
        };
        const cancel = (): void => {
          if (settled) return;
          settled = true;
          removePending();
          terminate({ worker, url });
          reject(new InitializationCancelled("initialization was superseded"));
        };
        pendingInitializations.set(currentGeneration, cancel);

        worker.onerror = (event) => {
          if (settled) return;
          settled = true;
          removePending();
          terminate({ worker, url });
          reject(event.error ?? new Error(event.message));
        };
        worker.onmessage = (event: MessageEvent<{ type: string; generation: number }>) => {
          if (event.data.type !== "ready") return;
          if (event.data.generation !== currentGeneration) {
            lifecycle.lateMessages++;
            return;
          }
          if (settled) return;
          settled = true;
          removePending();
          resolve({ worker, url });
        };
        worker.postMessage({ type: "boot", generation: currentGeneration, delay: workerDelay });
      });

    const initialize = async (
      label: string,
      initDelay: number,
      workerDelay: number
    ): Promise<void> => {
      const currentGeneration = ++generation;
      lifecycle.initializations++;
      cancelPending();
      disposeCommitted();

      try {
        if (initDelay > 0) await delay(initDelay);
        if (generation !== currentGeneration) throw new InitializationCancelled("stale delay");

        const module = await WebAssembly.compile(wasmAddModule);
        const instance = await WebAssembly.instantiate(module);
        lifecycle.wasmCreated++;
        if (generation !== currentGeneration) throw new InitializationCancelled("stale WASM");

        const handle = await bootWorker(currentGeneration, workerDelay);
        if (generation !== currentGeneration) {
          terminate(handle);
          throw new InitializationCancelled("stale worker");
        }

        const pendingComputations = new Map<
          number,
          { resolve(value: number): void; reject(error: Error): void }
        >();
        const committed: CommittedResources = {
          ...handle,
          generation: currentGeneration,
          label,
          add: instance.exports.add as (left: number, right: number) => number,
          pendingComputations
        };
        handle.worker.onmessage = (
          event: MessageEvent<{ type: string; id: number; value: number }>
        ) => {
          if (resources !== committed) {
            lifecycle.lateMessages++;
            return;
          }
          if (event.data.type !== "result") return;
          const pending = pendingComputations.get(event.data.id);
          if (!pending) {
            lifecycle.lateMessages++;
            return;
          }
          pendingComputations.delete(event.data.id);
          pending.resolve(event.data.value);
        };
        resources = committed;
        lifecycle.ready++;
      } catch (error) {
        if (error instanceof InitializationCancelled) {
          lifecycle.cancelled++;
          return;
        }
        throw error;
      }
    };

    defineExpose({
      startInitialization: initialize,
      compute: async (left: number, right: number): Promise<number> => {
        const current = resources;
        if (!current) throw new Error("async resources are unavailable");
        const expected = current.add(left, right);
        const id = ++requestId;
        const result = await new Promise<number>((resolve, reject) => {
          current.pendingComputations.set(id, { resolve, reject });
          current.worker.postMessage({ type: "compute", id, left, right });
        });
        check(result === expected, "Worker and WASM computations disagreed");
        lifecycle.computations++;
        return result;
      },
      getResourceSnapshot: (): { label: string; generation: number } | null =>
        resources ? { label: resources.label, generation: resources.generation } : null
    });

    onMounted(() => initialize("mounted", 0, 0));
    onUnmounted(() => {
      generation++;
      cancelPending();
      disposeCommitted();
    });

    return {};
  },
  render: () => {
    const output = document.createElement("output");
    output.textContent = "async resource host";
    return output;
  }
});

defineCustomElement({
  tag: "elf-external-async-error-child",
  setup: () => {
    onMounted(async () => {
      await WebAssembly.compile(new Uint8Array([0x00, 0x61]));
    });
    return {};
  },
  render: () => document.createElement("span")
});

defineCustomElement({
  tag: "elf-external-async-error-parent",
  setup: () => {
    onErrorCaptured((error) => {
      check(error instanceof WebAssembly.CompileError, "unexpected async lifecycle error type");
      lifecycle.asyncErrorsCaptured++;
      return false;
    });
    return {};
  },
  render: () => document.createElement("elf-external-async-error-child")
});

const run = async () => {
  const host = document.createElement("elf-external-async-resources") as AsyncResourceHost;
  document.body.appendChild(host);
  await waitFor(
    () => host.getResourceSnapshot()?.label === "mounted",
    "mounted Worker/WASM resources did not initialize"
  );
  check((await host.compute(7, 8)) === 15, "initial Worker/WASM computation failed");

  const workersBeforeRace = lifecycle.workerCreated;
  const slow = host.startInitialization("slow", 0, 80);
  await waitFor(
    () => lifecycle.workerCreated > workersBeforeRace,
    "slow race worker was not created"
  );
  const fast = host.startInitialization("fast", 0, 0);
  await Promise.all([slow, fast]);
  check(host.getResourceSnapshot()?.label === "fast", "stale initialization won the race");
  check(lifecycle.cancelled >= 1, "superseded worker initialization was not cancelled");
  check((await host.compute(20, 22)) === 42, "replacement Worker/WASM resources failed");

  const readyBeforeUnmount = lifecycle.ready;
  const workersBeforeUnmount = lifecycle.workerCreated;
  const pending = host.startInitialization("unmount-pending", 0, 100);
  await waitFor(
    () => lifecycle.workerCreated > workersBeforeUnmount,
    "pending unmount worker was not created"
  );
  host.remove();
  await nextMicrotask();
  await pending;
  await delay(120);
  check(
    lifecycle.ready === readyBeforeUnmount,
    "unmounted async initialization committed resources"
  );
  check(
    lifecycle.workerCreated === lifecycle.workerTerminated,
    "unmount left a pending or committed Worker alive"
  );
  check(lifecycle.lateMessages === 0, "terminated Worker delivered a late message");

  document.body.appendChild(host);
  await waitFor(
    () => host.getResourceSnapshot()?.label === "mounted",
    "reconnected host did not initialize fresh Worker/WASM resources"
  );
  check((await host.compute(9, 6)) === 15, "reconnected Worker/WASM computation failed");
  host.remove();
  await nextMicrotask();
  check(
    lifecycle.workerCreated === lifecycle.workerTerminated,
    "reconnected host did not terminate its Worker"
  );

  const errorParent = document.createElement("elf-external-async-error-parent");
  document.body.appendChild(errorParent);
  await waitFor(
    () => lifecycle.asyncErrorsCaptured === 1,
    "async onMounted rejection did not enter onErrorCaptured"
  );
  errorParent.remove();
  await nextMicrotask();

  return {
    cases: [
      {
        name: "Worker/WASM cancellation/race/error/termination lifecycle",
        status: "passed" as const
      }
    ],
    asyncResources: { ...lifecycle },
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
