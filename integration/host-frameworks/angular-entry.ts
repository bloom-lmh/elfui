import "@angular/compiler";

import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
  VERSION
} from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

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

interface AngularContractProps {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handler: (value: number) => number;
}

const initialConfig = { mode: "angular-initial" };
const initialItems = [{ id: "a" }, { id: "b" }];
const initialHandler = (value: number): number => value * 7;
const contractProps = signal<AngularContractProps>({
  textValue: "angular-initial",
  countValue: 6,
  active: true,
  config: initialConfig,
  items: initialItems,
  handler: initialHandler
});
const visible = signal(true);
const listItems = signal<HostListItem[]>(initialHostList);
const eventProbe = createHostEventProbe("Angular");

const AngularHost = Component({
  selector: "angular-host-contract",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (visible()) {
      <form>
        <elf-host-contract
          [textValue]="contractProps().textValue"
          [countValue]="contractProps().countValue"
          [active]="contractProps().active"
          [config]="contractProps().config"
          [items]="contractProps().items"
          [handler]="contractProps().handler"
          name="elfValue"
          [style.--contract-accent]="'rgb(12, 34, 56)'"
          (contract-single)="eventProbe.onSingle($event)"
          (contract-multiple)="eventProbe.onMultiple($event)"
          (contract-cancelable)="eventProbe.onCancelable($event)"
        >
          <span slot="label">Angular label</span>
          <span>Angular default</span>
        </elf-host-contract>
      </form>
    }
    <section data-host-list>
      @for (item of listItems(); track item.id) {
        <elf-host-contract
          [attr.data-list-id]="item.id"
          [textValue]="item.label"
        ></elf-host-contract>
      }
    </section>
  `
})(
  class AngularHostContract {
    readonly contractProps = contractProps;
    readonly eventProbe = eventProbe;
    readonly listItems = listItems;
    readonly visible = visible;
  }
);

const getHost = (container: Element): HostContractElement | null =>
  container.querySelector("elf-host-contract") as HostContractElement | null;

const run = async () => {
  const container = document.body.appendChild(document.createElement("div"));
  container.appendChild(document.createElement("angular-host-contract"));
  const app = await bootstrapApplication(AngularHost, {
    providers: [provideZonelessChangeDetection()]
  });
  await app.whenStable();
  const firstHost = getHost(container);
  check(firstHost, "Angular did not mount the ElfUI Custom Element");
  const initial = firstHost!.getContractSnapshot();
  check(initial.textValue === "angular-initial", "Angular string property failed");
  check(initial.countValue === 6, "Angular number property failed");
  check(initial.active === true, "Angular boolean property failed");
  check(initial.config === initialConfig, "Angular object property identity changed");
  check(initial.items === initialItems, "Angular array property identity changed");
  check(firstHost!.handler === initialHandler, "Angular function property identity changed");
  check(firstHost!.invokeHandler(3) === 21, "Angular function property invocation failed");
  eventProbe.verify(firstHost!, "initial");
  verifyHostPresentation(
    "Angular",
    firstHost!,
    "Angular label",
    "Angular default",
    "angular-initial"
  );
  verifyHostAttributeInputs("Angular", firstHost!);
  const initialList = verifyHostList("Angular", container, initialHostList);

  const updatedConfig = { mode: "angular-updated" };
  const updatedItems = ["x", "y", "z"];
  const updatedHandler = (value: number): number => value + 14;
  contractProps.set({
    textValue: "angular-updated",
    countValue: 16,
    active: false,
    config: updatedConfig,
    items: updatedItems,
    handler: updatedHandler
  });
  await app.whenStable();
  check(getHost(container) === firstHost, "Angular replaced the Custom Element during prop update");
  const updated = firstHost!.getContractSnapshot();
  check(updated.textValue === "angular-updated", "Angular string update failed");
  check(updated.countValue === 16, "Angular number update failed");
  check(updated.active === false, "Angular false boolean property failed");
  check(updated.config === updatedConfig, "Angular object update identity changed");
  check(updated.items === updatedItems, "Angular array update identity changed");
  check(firstHost!.handler === updatedHandler, "Angular function update identity changed");
  check(firstHost!.invokeHandler(3) === 17, "Angular updated function invocation failed");
  check(
    new FormData(firstHost!.closest("form")!).get("elfValue") === "angular-updated",
    "Angular form value update failed"
  );

  listItems.set(reorderedHostList);
  await app.whenStable();
  const reorderedList = verifyHostList("Angular", container, reorderedHostList, initialList);
  const removedListHost = reorderedList.get("a")!;
  listItems.set(replacedHostList);
  await app.whenStable();
  await nextMicrotask();
  verifyHostList("Angular", container, replacedHostList, reorderedList);
  check(!removedListHost.isConnected, "Angular removed keyed item remained connected");
  check(hostContractLifecycle.setup === 4, "Angular keyed list created excess instances");
  check(hostContractLifecycle.unmounted === 1, "Angular keyed list did not release removed item");

  visible.set(false);
  await app.whenStable();
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 2, "Angular conditional removal did not unmount ElfUI");
  eventProbe.verifyDetached(firstHost!);
  visible.set(true);
  await app.whenStable();
  const secondHost = getHost(container);
  check(secondHost && secondHost !== firstHost, "Angular conditional remount reused detached host");
  check(secondHost!.config === updatedConfig, "Angular remount lost object property identity");
  check(hostContractLifecycle.setup === 5, "Angular conditional setup count was incorrect");
  check(hostContractLifecycle.mounted === 5, "Angular conditional remount count was incorrect");
  eventProbe.verify(secondHost!, "remount");
  verifyHostPresentation(
    "Angular",
    secondHost!,
    "Angular label",
    "Angular default",
    "angular-updated"
  );

  app.destroy();
  await nextMicrotask();
  check(hostContractLifecycle.unmounted === 5, "Angular app destroy did not release ElfUI");
  check(getHost(container) === null, "Angular app retained the ElfUI host after destroy");
  eventProbe.verifyDetached(secondHost!);

  return {
    cases: [
      { name: "Angular property/update/remount contract", status: "passed" as const },
      { name: "Angular attribute/event contract", status: "passed" as const },
      { name: "Angular slot/style/focus/form contract", status: "passed" as const },
      { name: "Angular keyed list/resource cleanup contract", status: "passed" as const }
    ],
    angular: { ...hostContractLifecycle, version: VERSION.full, events: eventProbe.snapshot() },
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
