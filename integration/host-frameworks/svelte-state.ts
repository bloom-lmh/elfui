import { writable } from "svelte/store";

import { createHostEventProbe } from "./host-event-contract";
import { initialHostList, type HostListItem } from "./host-list-contract";

export interface SvelteContractProps {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handler: (value: number) => number;
}

export const initialConfig = { mode: "svelte-initial" };
export const initialItems = [{ id: "a" }, { id: "b" }];
export const initialHandler = (value: number): number => value * 6;

export const contractProps = writable<SvelteContractProps>({
  textValue: "svelte-initial",
  countValue: 5,
  active: true,
  config: initialConfig,
  items: initialItems,
  handler: initialHandler
});

export const visible = writable(true);
export const listItems = writable<HostListItem[]>(initialHostList);
export const eventProbe = createHostEventProbe("Svelte");
