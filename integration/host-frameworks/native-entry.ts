import {
  HostContract,
  hostContractLifecycle,
  type HostContractElement
} from "./contract-component";
import { verifyHostAttributeInputs } from "./host-attribute-contract";
import { createHostEventProbe } from "./host-event-contract";
import {
  initialHostList,
  reorderedHostList,
  replacedHostList,
  verifyHostList,
  type HostListItem
} from "./host-list-contract";
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

const createListHost = (item: HostListItem): HostContractElement => {
  const host = document.createElement("elf-host-contract") as HostContractElement;
  host.dataset.listId = item.id;
  host.textValue = item.label;
  return host;
};

const run = async () => {
  check(HostContract.__elfDefinition.tag === "elf-host-contract", "contract tag is unavailable");
  const config = { mode: "pre-mount", nested: { enabled: true } };
  const items = [{ id: 1 }, { id: 2 }];
  const handler = (value: number): number => value * 3;
  const host = document.createElement("elf-host-contract") as HostContractElement;
  const eventProbe = createHostEventProbe("native");
  host.addEventListener("contract-single", eventProbe.onSingle);
  host.addEventListener("contract-multiple", eventProbe.onMultiple);
  host.addEventListener("contract-cancelable", eventProbe.onCancelable);
  host.setAttribute("name", "elfValue");
  host.style.setProperty("--contract-accent", "rgb(12, 34, 56)");
  const label = document.createElement("span");
  label.slot = "label";
  label.textContent = "native label";
  const content = document.createElement("span");
  content.textContent = "native default";
  host.append(label, content);

  host.setAttribute("text-value", "attribute-before-mount");
  host.setAttribute("count-value", "2");
  host.setAttribute("active", "");
  host.textValue = "property-before-mount";
  host.countValue = 7;
  host.active = false;
  host.config = config;
  host.items = items;
  host.handler = handler;
  const form = document.createElement("form");
  form.appendChild(host);
  document.body.appendChild(form);
  const listSection = document.createElement("section");
  listSection.dataset.hostList = "";
  listSection.append(...initialHostList.map(createListHost));
  document.body.appendChild(listSection);

  const preMount = host.getContractSnapshot();
  check(preMount.textValue === "property-before-mount", "pre-mount string property lost");
  check(preMount.countValue === 7, "pre-mount number property lost");
  check(preMount.active === false, "pre-mount boolean property did not win over attribute");
  check(preMount.config === config, "pre-mount object property identity changed");
  check(preMount.items === items, "pre-mount array property identity changed");
  check(preMount.handlerType === "function", "pre-mount function property type changed");
  check(host.config === config, "host object property getter changed identity");
  check(host.items === items, "host array property getter changed identity");
  check(host.handler === handler, "host function property getter changed identity");
  check(host.invokeHandler(4) === 12, "function property invocation failed");
  eventProbe.verify(host, "initial");
  verifyHostPresentation("native", host, "native label", "native default", "property-before-mount");
  verifyHostAttributeInputs("native", host);
  const initialList = verifyHostList("native", document, initialHostList);

  const updatedConfig = { mode: "property-update" };
  const updatedItems = ["a", "b", "c"];
  host.textValue = "property-update";
  host.countValue = 11;
  host.active = true;
  host.config = updatedConfig;
  host.items = updatedItems;
  host.handler = (value) => value + 5;
  const updated = host.getContractSnapshot();
  check(updated.textValue === "property-update", "mounted string property update failed");
  check(updated.countValue === 11, "mounted number property update failed");
  check(updated.active === true, "mounted boolean property update failed");
  check(updated.config === updatedConfig, "mounted object property identity changed");
  check(updated.items === updatedItems, "mounted array property identity changed");
  check(host.invokeHandler(4) === 9, "mounted function property update failed");
  check(new FormData(form).get("elfValue") === "property-update", "form value update failed");

  for (const item of reorderedHostList) {
    const listHost = initialList.get(item.id)!;
    listHost.textValue = item.label;
    listSection.appendChild(listHost);
  }
  const reorderedList = verifyHostList("native", document, reorderedHostList, initialList);
  const removedListHost = reorderedList.get("a")!;
  const retainedListHost = reorderedList.get("b")!;
  retainedListHost.textValue = replacedHostList[0]!.label;
  const addedListHost = createListHost(replacedHostList[1]!);
  listSection.replaceChildren(retainedListHost, addedListHost);
  await nextMicrotask();
  verifyHostList("native", document, replacedHostList, reorderedList);
  check(!removedListHost.isConnected, "native removed keyed item remained connected");
  check(hostContractLifecycle.setup === 4, "native keyed list created excess instances");
  check(hostContractLifecycle.unmounted === 1, "native keyed list did not release removed item");

  host.setAttribute("config", '{"mode":"attribute-json"}');
  host.setAttribute("items", "[1,2,3,4]");
  check(host.config.mode === "attribute-json", "object JSON attribute conversion failed");
  check(host.items.length === 4, "array JSON attribute conversion failed");
  check(
    host.shadowRoot?.querySelector("output")?.textContent ===
      "property-update|11|true|attribute-json|4",
    "host-visible reactive output did not track property/attribute updates"
  );

  host.removeEventListener("contract-single", eventProbe.onSingle);
  host.removeEventListener("contract-multiple", eventProbe.onMultiple);
  host.removeEventListener("contract-cancelable", eventProbe.onCancelable);
  form.remove();
  listSection.remove();
  await nextMicrotask();
  eventProbe.verifyDetached(host);
  check(hostContractLifecycle.setup === 4, "native host repeated setup");
  check(hostContractLifecycle.mounted === 4, "native host repeated mounted");
  check(hostContractLifecycle.unmounted === 4, "native host did not release every instance");

  return {
    cases: [
      { name: "native host property and attribute contract", status: "passed" as const },
      { name: "native host event propagation/cancellation contract", status: "passed" as const },
      { name: "native host slot/style/focus/form contract", status: "passed" as const },
      { name: "native keyed list/resource cleanup contract", status: "passed" as const }
    ],
    native: { ...hostContractLifecycle, events: eventProbe.snapshot() },
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
