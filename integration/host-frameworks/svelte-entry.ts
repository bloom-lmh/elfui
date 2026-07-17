import { mount, tick, unmount } from "svelte";

import SvelteHost from "./SvelteHost.svelte";
import { hostContractLifecycle, type HostContractElement } from "./contract-component";
import { verifyHostAttributeInputs } from "./host-attribute-contract";
import {
  initialHostList,
  reorderedHostList,
  replacedHostList,
  verifyHostList
} from "./host-list-contract";
import {
  contractProps,
  eventProbe,
  initialConfig,
  initialHandler,
  initialItems,
  listItems,
  visible
} from "./svelte-state";
import { verifyHostPresentation } from "./host-presentation-contract";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

const publish = (id: "result" | "error", payload: unknown): void => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.createElement("pre");
  output.id = id;
  output.dataset.json = encoded;
  document.body.replaceChildren(output);
};

const getHost = (container: Element): HostContractElement | null =>
  container.querySelector("elf-host-contract") as HostContractElement | null;

const run = async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const app = mount(SvelteHost, { target: container });
  await tick();
  const firstHost = getHost(container);
  check(firstHost, "Svelte did not mount the ElfUI Custom Element");
  const initial = firstHost!.getContractSnapshot();
  check(
    initial.textValue === "svelte-initial",
    `Svelte string property failed: ${JSON.stringify(initial)}`
  );
  check(initial.countValue === 5, "Svelte number property failed");
  check(initial.active === true, "Svelte boolean property failed");
  check(initial.config === initialConfig, "Svelte object property identity changed");
  check(initial.items === initialItems, "Svelte array property identity changed");
  check(firstHost!.handler === initialHandler, "Svelte function property identity changed");
  check(firstHost!.invokeHandler(3) === 18, "Svelte function property invocation failed");
  eventProbe.verify(firstHost!, "initial");
  verifyHostPresentation("Svelte", firstHost!, "Svelte label", "Svelte default", "svelte-initial");
  verifyHostAttributeInputs("Svelte", firstHost!);
  const initialList = verifyHostList("Svelte", container, initialHostList);

  const updatedConfig = { mode: "svelte-updated" };
  const updatedItems = ["x", "y", "z"];
  const updatedHandler = (value: number): number => value + 13;
  contractProps.set({
    textValue: "svelte-updated",
    countValue: 15,
    active: false,
    config: updatedConfig,
    items: updatedItems,
    handler: updatedHandler
  });
  await tick();
  check(getHost(container) === firstHost, "Svelte replaced the Custom Element during prop update");
  const updated = firstHost!.getContractSnapshot();
  check(updated.textValue === "svelte-updated", "Svelte string update failed");
  check(updated.countValue === 15, "Svelte number update failed");
  check(updated.active === false, "Svelte false boolean property failed");
  check(updated.config === updatedConfig, "Svelte object update identity changed");
  check(updated.items === updatedItems, "Svelte array update identity changed");
  check(firstHost!.handler === updatedHandler, "Svelte function update identity changed");
  check(firstHost!.invokeHandler(3) === 16, "Svelte updated function invocation failed");
  check(
    new FormData(firstHost!.closest("form")!).get("elfValue") === "svelte-updated",
    "Svelte form value update failed"
  );

  listItems.set(reorderedHostList);
  await tick();
  const reorderedList = verifyHostList("Svelte", container, reorderedHostList, initialList);
  const removedListHost = reorderedList.get("a")!;
  listItems.set(replacedHostList);
  await tick();
  await nextMicrotask();
  verifyHostList("Svelte", container, replacedHostList, reorderedList);
  check(!removedListHost.isConnected, "Svelte removed keyed item remained connected");
  check(hostContractLifecycle.setup === 4, "Svelte keyed list created excess instances");
  check(hostContractLifecycle.unmounted === 1, "Svelte keyed list did not release removed item");

  visible.set(false);
  await tick();
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 2, "Svelte conditional removal did not unmount ElfUI");
  eventProbe.verifyDetached(firstHost!);
  visible.set(true);
  await tick();
  const secondHost = getHost(container);
  check(secondHost && secondHost !== firstHost, "Svelte conditional remount reused detached host");
  check(secondHost!.config === updatedConfig, "Svelte remount lost object property identity");
  check(hostContractLifecycle.setup === 5, "Svelte conditional setup count was incorrect");
  check(hostContractLifecycle.mounted === 5, "Svelte conditional remount count was incorrect");
  eventProbe.verify(secondHost!, "remount");
  verifyHostPresentation("Svelte", secondHost!, "Svelte label", "Svelte default", "svelte-updated");

  await unmount(app);
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 5, "Svelte app unmount did not release ElfUI");
  check(container.childElementCount === 0, "Svelte app retained the ElfUI host after unmount");
  eventProbe.verifyDetached(secondHost!);

  return {
    cases: [
      { name: "Svelte property/update/remount contract", status: "passed" as const },
      { name: "Svelte attribute/event contract", status: "passed" as const },
      { name: "Svelte slot/style/focus/form contract", status: "passed" as const },
      { name: "Svelte keyed list/resource cleanup contract", status: "passed" as const }
    ],
    svelte: { ...hostContractLifecycle, events: eventProbe.snapshot() },
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
