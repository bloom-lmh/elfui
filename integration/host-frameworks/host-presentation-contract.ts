import type { HostContractElement } from "./contract-component";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const ensurePartStyle = (): void => {
  if (document.querySelector("style[data-host-contract-part]")) return;
  const style = document.createElement("style");
  style.dataset.hostContractPart = "";
  style.textContent = `
    elf-host-contract::part(surface) {
      border-top-width: 7px;
      border-top-style: solid;
      border-top-color: rgb(90, 80, 70);
    }
  `;
  document.head.appendChild(style);
};

export const verifyHostPresentation = (
  hostName: string,
  host: HostContractElement,
  expectedLabel: string,
  expectedDefault: string,
  expectedFormValue: string
): void => {
  ensurePartStyle();
  const labelSlot = host.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="label"]');
  const defaultSlot = host.shadowRoot?.querySelector<HTMLSlotElement>("slot:not([name])");
  check(labelSlot, `${hostName} named slot was not rendered`);
  check(defaultSlot, `${hostName} default slot was not rendered`);
  check(
    labelSlot!
      .assignedElements()
      .map((element) => element.textContent?.trim())
      .join("|") === expectedLabel,
    `${hostName} named slot assignment was incorrect`
  );
  check(
    defaultSlot!
      .assignedElements()
      .map((element) => element.textContent?.trim())
      .join("|") === expectedDefault,
    `${hostName} default slot assignment was incorrect`
  );

  const surface = host.shadowRoot?.querySelector<HTMLElement>('[part~="surface"]');
  check(surface, `${hostName} surface part was not exposed`);
  const surfaceStyle = getComputedStyle(surface!);
  check(
    surfaceStyle.color === "rgb(12, 34, 56)",
    `${hostName} CSS custom property did not cross Shadow DOM`
  );
  check(surfaceStyle.borderTopWidth === "7px", `${hostName} ::part style was not applied`);
  check(
    surfaceStyle.borderTopColor === "rgb(90, 80, 70)",
    `${hostName} ::part color was not applied`
  );

  host.focusControl();
  check(document.activeElement === host, `${hostName} focus did not reach the Custom Element host`);
  check(
    host.shadowRoot?.activeElement?.tagName === "BUTTON",
    `${hostName} focus did not reach the Shadow DOM control`
  );

  const form = host.closest("form");
  check(form, `${hostName} Custom Element was not hosted inside a form`);
  check(
    new FormData(form!).get("elfValue") === expectedFormValue,
    `${hostName} form-associated value was incorrect`
  );
};
