import { createApp, h, nextTick, ref, shallowRef, version, type Component } from "vue";

import { hostContractLifecycle, type HostContractElement } from "./contract-component";
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

interface VueContractProps {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handler: (value: number) => number;
}

const initialConfig = { mode: "vue-initial" };
const initialItems = [{ id: "a" }, { id: "b" }];
const initialHandler = (value: number): number => value * 5;
let replaceProps: ((props: VueContractProps) => void) | null = null;
let setVisible: ((visible: boolean) => void) | null = null;
let replaceList: ((items: HostListItem[]) => void) | null = null;
let vueRenders = 0;
const eventProbe = createHostEventProbe("Vue");

const getHost = (container: Element): HostContractElement | null =>
  container.querySelector("elf-host-contract") as HostContractElement | null;

const VueHost: Component = {
  name: "ElfUIVueHostContract",
  setup: () => {
    const contractProps = shallowRef<VueContractProps>({
      textValue: "vue-initial",
      countValue: 4,
      active: true,
      config: initialConfig,
      items: initialItems,
      handler: initialHandler
    });
    const visible = ref(true);
    const listItems = shallowRef<HostListItem[]>(initialHostList);
    replaceProps = (props) => {
      contractProps.value = props;
    };
    setVisible = (nextVisible) => {
      visible.value = nextVisible;
    };
    replaceList = (items) => {
      listItems.value = items;
    };

    return () => {
      vueRenders++;
      return h("div", null, [
        visible.value
          ? h("form", null, [
              h(
                "elf-host-contract",
                {
                  ...contractProps.value,
                  name: "elfValue",
                  style: { "--contract-accent": "rgb(12, 34, 56)" },
                  onContractSingle: eventProbe.onSingle,
                  onContractMultiple: eventProbe.onMultiple,
                  onContractCancelable: eventProbe.onCancelable
                },
                [h("span", { slot: "label" }, "Vue label"), h("span", null, "Vue default")]
              )
            ])
          : null,
        h(
          "section",
          { "data-host-list": "" },
          listItems.value.map((item) =>
            h("elf-host-contract", {
              key: item.id,
              "data-list-id": item.id,
              textValue: item.label
            })
          )
        )
      ]);
    };
  }
};

const run = async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const app = createApp(VueHost);
  app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith("elf-");
  app.mount(container);
  await nextTick();
  const firstHost = getHost(container);
  check(firstHost, "Vue did not mount the ElfUI Custom Element");
  const initial = firstHost!.getContractSnapshot();
  check(initial.textValue === "vue-initial", "Vue string property failed");
  check(initial.countValue === 4, "Vue number property failed");
  check(initial.active === true, "Vue boolean property failed");
  check(initial.config === initialConfig, "Vue object property identity changed");
  check(initial.items === initialItems, "Vue array property identity changed");
  check(firstHost!.handler === initialHandler, "Vue function property identity changed");
  check(firstHost!.invokeHandler(3) === 15, "Vue function property invocation failed");
  eventProbe.verify(firstHost!, "initial");
  verifyHostPresentation("Vue", firstHost!, "Vue label", "Vue default", "vue-initial");
  verifyHostAttributeInputs("Vue", firstHost!);
  const initialList = verifyHostList("Vue", container, initialHostList);

  const updatedConfig = { mode: "vue-updated" };
  const updatedItems = ["x", "y", "z"];
  const updatedHandler = (value: number): number => value + 12;
  replaceProps?.({
    textValue: "vue-updated",
    countValue: 14,
    active: false,
    config: updatedConfig,
    items: updatedItems,
    handler: updatedHandler
  });
  await nextTick();
  check(getHost(container) === firstHost, "Vue replaced the Custom Element during prop update");
  const updated = firstHost!.getContractSnapshot();
  check(updated.textValue === "vue-updated", "Vue string update failed");
  check(updated.countValue === 14, "Vue number update failed");
  check(updated.active === false, "Vue false boolean property failed");
  check(updated.config === updatedConfig, "Vue object update identity changed");
  check(updated.items === updatedItems, "Vue array update identity changed");
  check(firstHost!.handler === updatedHandler, "Vue function update identity changed");
  check(firstHost!.invokeHandler(3) === 15, "Vue updated function invocation failed");
  check(
    new FormData(firstHost!.closest("form")!).get("elfValue") === "vue-updated",
    "Vue form value update failed"
  );

  replaceList?.(reorderedHostList);
  await nextTick();
  const reorderedList = verifyHostList("Vue", container, reorderedHostList, initialList);
  const removedListHost = reorderedList.get("a")!;
  replaceList?.(replacedHostList);
  await nextTick();
  await nextMicrotask();
  verifyHostList("Vue", container, replacedHostList, reorderedList);
  check(!removedListHost.isConnected, "Vue removed keyed item remained connected");
  check(hostContractLifecycle.setup === 4, "Vue keyed list created excess instances");
  check(hostContractLifecycle.unmounted === 1, "Vue keyed list did not release removed item");

  setVisible?.(false);
  await nextTick();
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 2, "Vue conditional removal did not unmount ElfUI");
  eventProbe.verifyDetached(firstHost!);
  setVisible?.(true);
  await nextTick();
  const secondHost = getHost(container);
  check(secondHost && secondHost !== firstHost, "Vue conditional remount reused detached host");
  check(secondHost!.config === updatedConfig, "Vue remount lost object property identity");
  check(hostContractLifecycle.setup === 5, "Vue conditional setup count was incorrect");
  check(hostContractLifecycle.mounted === 5, "Vue conditional remount count was incorrect");
  eventProbe.verify(secondHost!, "remount");
  verifyHostPresentation("Vue", secondHost!, "Vue label", "Vue default", "vue-updated");

  app.unmount();
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 5, "Vue app unmount did not release ElfUI");
  check(container.childElementCount === 0, "Vue app retained the ElfUI host after unmount");
  eventProbe.verifyDetached(secondHost!);

  return {
    cases: [
      { name: "Vue property/update/remount contract", status: "passed" as const },
      { name: "Vue attribute/event contract", status: "passed" as const },
      { name: "Vue slot/style/focus/form contract", status: "passed" as const },
      { name: "Vue keyed list/resource cleanup contract", status: "passed" as const }
    ],
    vue: { ...hostContractLifecycle, vueRenders, version, events: eventProbe.snapshot() },
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
