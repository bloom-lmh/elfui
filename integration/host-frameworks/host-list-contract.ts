import type { HostContractElement } from "./contract-component";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export interface HostListItem {
  id: string;
  label: string;
}

export const initialHostList: HostListItem[] = [
  { id: "a", label: "item-a-initial" },
  { id: "b", label: "item-b-initial" }
];

export const reorderedHostList: HostListItem[] = [
  { id: "b", label: "item-b-updated" },
  { id: "a", label: "item-a-updated" }
];

export const replacedHostList: HostListItem[] = [
  { id: "b", label: "item-b-final" },
  { id: "c", label: "item-c-new" }
];

export const verifyHostList = (
  hostName: string,
  container: ParentNode,
  expected: HostListItem[],
  previous?: ReadonlyMap<string, HostContractElement>
): Map<string, HostContractElement> => {
  const hosts = Array.from(
    container.querySelectorAll<HostContractElement>("elf-host-contract[data-list-id]")
  );
  check(hosts.length === expected.length, `${hostName} list length was incorrect`);
  check(
    hosts.map((host) => host.dataset.listId).join(",") ===
      expected.map((item) => item.id).join(","),
    `${hostName} keyed list order was incorrect`
  );

  const current = new Map<string, HostContractElement>();
  for (const item of expected) {
    const host = hosts.find((candidate) => candidate.dataset.listId === item.id);
    check(host, `${hostName} list item ${item.id} was missing`);
    check(host!.textValue === item.label, `${hostName} list item ${item.id} did not update`);
    if (previous?.has(item.id)) {
      check(previous.get(item.id) === host, `${hostName} replaced keyed item ${item.id}`);
    }
    current.set(item.id, host!);
  }
  return current;
};
