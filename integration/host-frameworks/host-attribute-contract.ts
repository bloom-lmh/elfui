import type { HostContractElement } from "./contract-component";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export const verifyHostAttributeInputs = (hostName: string, host: HostContractElement): void => {
  host.setAttribute("text-value", "attribute-contract");
  host.setAttribute("count-value", "23");
  check(host.textValue === "attribute-contract", `${hostName} string attribute did not win`);
  check(host.countValue === 23, `${hostName} number attribute did not win`);

  const booleanMatrix: Array<[string | null, boolean]> = [
    ["", true],
    ["true", true],
    ["active", true],
    ["false", false],
    ["other", false],
    [null, false]
  ];
  for (const [attribute, expected] of booleanMatrix) {
    if (attribute === null) host.removeAttribute("active");
    else host.setAttribute("active", attribute);
    check(
      host.active === expected,
      `${hostName} Boolean attribute ${String(attribute)} was incorrect`
    );
  }
};
