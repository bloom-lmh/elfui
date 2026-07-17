import type { HostContractElement } from "./contract-component";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export interface HostEventProbe {
  readonly onSingle: EventListener;
  readonly onMultiple: EventListener;
  readonly onCancelable: EventListener;
  verify(host: HostContractElement, cycle: string): void;
  verifyDetached(host: HostContractElement): void;
  snapshot(): { single: number; multiple: number; cancelable: number; bubbled: number };
}

export const createHostEventProbe = (hostName: string): HostEventProbe => {
  let expectedSingle: unknown;
  let expectedPrevious: unknown;
  let expectedNext: unknown;
  let expectedCancelable: unknown;
  let single = 0;
  let multiple = 0;
  let cancelable = 0;
  let bubbled = 0;

  const requireCustomEvent = (event: Event, name: string): CustomEvent => {
    check(event instanceof CustomEvent, `${hostName} ${name} was not a CustomEvent`);
    return event as CustomEvent;
  };

  const onSingle: EventListener = (event) => {
    const customEvent = requireCustomEvent(event, "single event");
    check(
      customEvent.detail === expectedSingle,
      `${hostName} single event detail identity changed`
    );
    check(customEvent.bubbles, `${hostName} single event did not bubble`);
    check(customEvent.composed, `${hostName} single event was not composed`);
    check(!customEvent.cancelable, `${hostName} single event became cancelable`);
    single++;
  };
  const onMultiple: EventListener = (event) => {
    const customEvent = requireCustomEvent(event, "multiple event");
    check(Array.isArray(customEvent.detail), `${hostName} multiple event detail was not an array`);
    check(customEvent.detail.length === 2, `${hostName} multiple event arity changed`);
    check(
      customEvent.detail[0] === expectedPrevious && customEvent.detail[1] === expectedNext,
      `${hostName} multiple event detail identity changed`
    );
    check(
      customEvent.bubbles && customEvent.composed,
      `${hostName} multiple event did not propagate`
    );
    multiple++;
  };
  const onCancelable: EventListener = (event) => {
    const customEvent = requireCustomEvent(event, "cancelable event");
    check(
      customEvent.detail === expectedCancelable,
      `${hostName} cancelable event detail identity changed`
    );
    check(customEvent.cancelable, `${hostName} cancelable event was not cancelable`);
    customEvent.preventDefault();
    cancelable++;
  };

  const verify = (host: HostContractElement, cycle: string): void => {
    const before = { single, multiple, cancelable, bubbled };
    expectedSingle = { host: hostName, cycle, kind: "single" };
    expectedPrevious = { host: hostName, cycle, version: "previous" };
    expectedNext = { host: hostName, cycle, version: "next" };
    expectedCancelable = { host: hostName, cycle, kind: "cancelable" };
    const onDocumentEvent = (event: Event): void => {
      if (event.target === host) bubbled++;
    };
    document.addEventListener("contract-single", onDocumentEvent);
    try {
      check(host.emitSingle(expectedSingle), `${hostName} single event dispatch was canceled`);
      check(
        host.emitMultiple(expectedPrevious, expectedNext),
        `${hostName} multiple event dispatch was canceled`
      );
      check(
        host.emitCancelable(expectedCancelable) === false,
        `${hostName} cancelable event did not report preventDefault()`
      );
    } finally {
      document.removeEventListener("contract-single", onDocumentEvent);
    }
    check(single === before.single + 1, `${hostName} single event listener count was incorrect`);
    check(
      multiple === before.multiple + 1,
      `${hostName} multiple event listener count was incorrect`
    );
    check(
      cancelable === before.cancelable + 1,
      `${hostName} cancelable event listener count was incorrect`
    );
    check(bubbled === before.bubbled + 1, `${hostName} event did not reach document`);
  };

  const verifyDetached = (host: HostContractElement): void => {
    check(!host.isConnected, `${hostName} event host was still connected after removal`);
    let reachedDocument = false;
    expectedSingle = { detached: true };
    const onDocumentEvent = (): void => {
      reachedDocument = true;
    };
    document.addEventListener("contract-single", onDocumentEvent);
    try {
      host.emitSingle(expectedSingle);
    } finally {
      document.removeEventListener("contract-single", onDocumentEvent);
    }
    check(!reachedDocument, `${hostName} detached event escaped into the application tree`);
  };

  return {
    onSingle,
    onMultiple,
    onCancelable,
    verify,
    verifyDetached,
    snapshot: () => ({ single, multiple, cancelable, bubbled })
  };
};
