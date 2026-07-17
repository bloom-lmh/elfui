import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

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

interface ReactContractProps {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handler: (value: number) => number;
}

const initialConfig = { mode: "react-initial" };
const initialItems = [{ id: "a" }, { id: "b" }];
const initialHandler = (value: number): number => value * 4;
let currentHost: HostContractElement | null = null;
let replaceProps: ((props: ReactContractProps) => void) | null = null;
let setVisible: ((visible: boolean) => void) | null = null;
let replaceList: ((items: HostListItem[]) => void) | null = null;
let reactRenders = 0;
const eventProbe = createHostEventProbe("React");

const ReactHost = (): React.ReactNode => {
  reactRenders++;
  const [props, updateProps] = useState<ReactContractProps>({
    textValue: "react-initial",
    countValue: 3,
    active: true,
    config: initialConfig,
    items: initialItems,
    handler: initialHandler
  });
  const [visible, updateVisible] = useState(true);
  const [listItems, updateListItems] = useState<HostListItem[]>(initialHostList);
  replaceProps = updateProps;
  setVisible = updateVisible;
  replaceList = updateListItems;

  return React.createElement(
    React.Fragment,
    null,
    visible
      ? React.createElement(
          "form",
          null,
          React.createElement(
            "elf-host-contract" as never,
            {
              ...props,
              name: "elfValue",
              style: { "--contract-accent": "rgb(12, 34, 56)" },
              "oncontract-single": eventProbe.onSingle,
              "oncontract-multiple": eventProbe.onMultiple,
              "oncontract-cancelable": eventProbe.onCancelable,
              ref: (element: HostContractElement | null) => {
                currentHost = element;
              }
            } as never,
            React.createElement("span", { slot: "label" }, "React label"),
            React.createElement("span", null, "React default")
          )
        )
      : null,
    React.createElement(
      "section",
      { "data-host-list": "" },
      listItems.map((item) =>
        React.createElement(
          "elf-host-contract" as never,
          {
            key: item.id,
            "data-list-id": item.id,
            textValue: item.label
          } as never
        )
      )
    )
  );
};

const run = async () => {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  flushSync(() => {
    root.render(React.createElement(StrictMode, null, React.createElement(ReactHost)));
  });
  const firstHost = currentHost;
  check(firstHost, "React did not mount the ElfUI Custom Element");
  const initial = firstHost!.getContractSnapshot();
  check(initial.textValue === "react-initial", "React string property failed");
  check(initial.countValue === 3, "React number property failed");
  check(initial.active === true, "React boolean property failed");
  check(initial.config === initialConfig, "React object property identity changed");
  check(initial.items === initialItems, "React array property identity changed");
  check(firstHost!.handler === initialHandler, "React function property identity changed");
  check(firstHost!.invokeHandler(5) === 20, "React function property invocation failed");
  eventProbe.verify(firstHost!, "initial");
  verifyHostPresentation("React", firstHost!, "React label", "React default", "react-initial");
  verifyHostAttributeInputs("React", firstHost!);
  const initialList = verifyHostList("React", container, initialHostList);

  const updatedConfig = { mode: "react-updated" };
  const updatedItems = [1, 2, 3];
  const updatedHandler = (value: number): number => value + 10;
  flushSync(() => {
    replaceProps?.({
      textValue: "react-updated",
      countValue: 8,
      active: false,
      config: updatedConfig,
      items: updatedItems,
      handler: updatedHandler
    });
  });
  check(currentHost === firstHost, "React replaced the Custom Element during prop update");
  const updated = firstHost!.getContractSnapshot();
  check(updated.textValue === "react-updated", "React string update failed");
  check(updated.countValue === 8, "React number update failed");
  check(updated.active === false, "React false boolean property failed");
  check(updated.config === updatedConfig, "React object update identity changed");
  check(updated.items === updatedItems, "React array update identity changed");
  check(firstHost!.handler === updatedHandler, "React function update identity changed");
  check(firstHost!.invokeHandler(5) === 15, "React updated function invocation failed");
  check(
    new FormData(firstHost!.closest("form")!).get("elfValue") === "react-updated",
    "React form value update failed"
  );

  flushSync(() => replaceList?.(reorderedHostList));
  const reorderedList = verifyHostList("React", container, reorderedHostList, initialList);
  const removedListHost = reorderedList.get("a")!;
  flushSync(() => replaceList?.(replacedHostList));
  await nextMicrotask();
  verifyHostList("React", container, replacedHostList, reorderedList);
  check(!removedListHost.isConnected, "React removed keyed item remained connected");
  check(hostContractLifecycle.setup === 4, "React keyed list created excess instances");
  check(hostContractLifecycle.unmounted === 1, "React keyed list did not release removed item");

  flushSync(() => setVisible?.(false));
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 2, "React conditional removal did not unmount ElfUI");
  eventProbe.verifyDetached(firstHost!);
  flushSync(() => setVisible?.(true));
  const secondHost = currentHost;
  check(secondHost && secondHost !== firstHost, "React conditional remount reused detached host");
  check(secondHost!.config === updatedConfig, "React remount lost object property identity");
  check(
    hostContractLifecycle.setup === 5,
    "React StrictMode/conditional setup count was incorrect"
  );
  check(hostContractLifecycle.mounted === 5, "React conditional remount count was incorrect");
  eventProbe.verify(secondHost!, "remount");
  verifyHostPresentation("React", secondHost!, "React label", "React default", "react-updated");

  flushSync(() => root.unmount());
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 5, "React root unmount did not release ElfUI");
  check(container.childElementCount === 0, "React root retained the ElfUI host after unmount");
  eventProbe.verifyDetached(secondHost!);

  return {
    cases: [
      { name: "React 19 property/StrictMode/remount contract", status: "passed" as const },
      { name: "React 19 attribute/event contract", status: "passed" as const },
      { name: "React 19 slot/style/focus/form contract", status: "passed" as const },
      { name: "React 19 keyed list/resource cleanup contract", status: "passed" as const }
    ],
    react: { ...hostContractLifecycle, reactRenders, events: eventProbe.snapshot() },
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
