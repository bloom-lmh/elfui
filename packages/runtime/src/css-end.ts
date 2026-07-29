interface CssEndInfo {
  timeout: number;
  eventCount: number;
}

const parseTime = (value: string): number => {
  const normalized = value.trim();
  if (normalized.endsWith("ms")) return Number.parseFloat(normalized) || 0;
  if (normalized.endsWith("s")) return (Number.parseFloat(normalized) || 0) * 1000;
  return 0;
};

const parseTimes = (value: string): number[] => value.split(",").map(parseTime);

const listValue = (values: readonly number[], index: number): number =>
  values[index % values.length] ?? 0;

const collectEndInfo = (
  durations: readonly number[],
  delays: readonly number[],
  iterations?: readonly number[]
): CssEndInfo => {
  let timeout = 0;
  let eventCount = 0;
  for (let index = 0; index < durations.length; index++) {
    const duration = listValue(durations, index);
    const iteration = iterations ? listValue(iterations, index) : 1;
    if (duration <= 0 || !Number.isFinite(iteration) || iteration <= 0) continue;
    timeout = Math.max(timeout, Math.max(0, listValue(delays, index)) + duration * iteration);
    eventCount++;
  }
  return { timeout, eventCount };
};

const readCssEndInfo = (el: Element): CssEndInfo => {
  const view = el.ownerDocument.defaultView;
  if (!view) return { timeout: 0, eventCount: 0 };

  try {
    const style = view.getComputedStyle(el);
    const transition = collectEndInfo(
      parseTimes(style.transitionDuration),
      parseTimes(style.transitionDelay)
    );
    const animation = collectEndInfo(
      parseTimes(style.animationDuration),
      parseTimes(style.animationDelay),
      style.animationIterationCount.split(",").map((value) => {
        const normalized = value.trim();
        return normalized === "infinite" ? Number.POSITIVE_INFINITY : Number.parseFloat(normalized);
      })
    );
    return {
      timeout: Math.max(transition.timeout, animation.timeout),
      eventCount: transition.eventCount + animation.eventCount
    };
  } catch {
    return { timeout: 0, eventCount: 0 };
  }
};

export const waitForCssEnd = (
  el: Element,
  explicitDuration: number | undefined,
  finish: () => void,
  addCleanup: (cleanup: () => void) => void
): void => {
  const info = readCssEndInfo(el);
  let remaining = info.eventCount;
  let active = true;
  const eventNames = [
    "transitionend",
    "transitioncancel",
    "animationend",
    "animationcancel"
  ] as const;
  const cleanup = (): void => {
    if (!active) return;
    active = false;
    for (const name of eventNames) el.removeEventListener(name, onEnd);
    clearTimeout(timer);
  };
  const complete = (): void => {
    if (!active) return;
    cleanup();
    finish();
  };
  const onEnd = (event: Event): void => {
    if (event.target !== el) return;
    if (remaining > 1) {
      remaining--;
      return;
    }
    complete();
  };

  const timeout = Math.max(0, explicitDuration ?? info.timeout);
  const timer = setTimeout(complete, Math.ceil(timeout) + 1);
  for (const name of eventNames) el.addEventListener(name, onEnd);
  addCleanup(cleanup);
};
