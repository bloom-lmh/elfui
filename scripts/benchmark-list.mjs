import { performance } from "node:perf_hooks";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.Comment = window.Comment;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.__DEV__ = false;

const [{ list, mark }, { useRef }] = await Promise.all([
  import("../packages/runtime/dist/control-flow.js"),
  import("../packages/reactivity/dist/index.js")
]);

const makeItems = (count) =>
  Array.from({ length: count }, (_, id) => ({
    id,
    label: `Item ${id}`
  }));

const renderRow = (item) => {
  const row = document.createElement("div");
  row.textContent = item.label;
  return row;
};

const withDomCounters = (run) => {
  const counters = {
    insertBefore: 0,
    removeChild: 0
  };
  const nodeProto = window.Node.prototype;
  const originalInsertBefore = nodeProto.insertBefore;
  const originalRemoveChild = nodeProto.removeChild;

  nodeProto.insertBefore = function insertBeforeWithCount(node, child) {
    counters.insertBefore++;
    return originalInsertBefore.call(this, node, child);
  };
  nodeProto.removeChild = function removeChildWithCount(child) {
    counters.removeChild++;
    return originalRemoveChild.call(this, child);
  };

  try {
    run(counters);
  } finally {
    nodeProto.insertBefore = originalInsertBefore;
    nodeProto.removeChild = originalRemoveChild;
  }

  return counters;
};

const setupList = (count) => {
  const root = document.createElement("div");
  const anchor = mark("list-bench");
  const items = useRef(makeItems(count));
  root.appendChild(anchor);
  document.body.appendChild(root);
  list(
    anchor,
    () => items.value,
    (item) => item.id,
    renderRow
  );

  return {
    items,
    cleanup() {
      root.remove();
    }
  };
};

const measure = (name, run) => {
  let duration = 0;
  const counters = withDomCounters(() => {
    const startedAt = performance.now();
    run();
    duration = performance.now() - startedAt;
  });
  console.log(
    `${name.padEnd(18)} ${duration.toFixed(2).padStart(8)} ms  insertBefore=${String(
      counters.insertBefore
    ).padStart(6)}  removeChild=${String(counters.removeChild).padStart(6)}`
  );
};

for (const count of [1000, 10000]) {
  measure(`${count} create`, () => {
    const app = setupList(count);
    app.cleanup();
  });

  const updateApp = setupList(count);
  measure(`${count} update`, () => {
    updateApp.items.value = makeItems(count);
  });
  updateApp.cleanup();

  const swapApp = setupList(count);
  measure(`${count} swap`, () => {
    const next = swapApp.items.value.slice();
    [next[0], next[count - 1]] = [next[count - 1], next[0]];
    swapApp.items.value = next;
  });
  swapApp.cleanup();

  const removeApp = setupList(count);
  measure(`${count} remove`, () => {
    removeApp.items.value = removeApp.items.value.slice(0, Math.floor(count / 2));
  });
  removeApp.cleanup();
}
