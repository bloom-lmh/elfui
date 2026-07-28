import { DEV as __DEV__ } from "./dev";
import { getCurrentInstance } from "./lifecycle";

interface HostIdState {
  instance: object | null;
  cursor: number;
  values: string[];
}

const HOST_IDS = new WeakMap<HTMLElement, HostIdState>();
const GLOBAL_COUNTER_KEY = Symbol.for("elfui.runtime.use-id-counter");

const nextGlobalId = (): number => {
  const target = globalThis as Record<symbol, unknown>;
  const current = typeof target[GLOBAL_COUNTER_KEY] === "number" ? target[GLOBAL_COUNTER_KEY] : 0;
  const next = (current as number) + 1;
  target[GLOBAL_COUNTER_KEY] = next;
  return next;
};

const normalizePrefix = (prefix: string): string => {
  const normalized = prefix
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || "elf";
};

/**
 * Returns a stable, document-unique id for the current component setup call position.
 *
 * The same host receives the same ids after a disconnect/reconnect setup cycle. Call order must
 * therefore remain unconditional, just like other setup hooks.
 */
export const useId = (prefix = "elf"): string => {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(__DEV__ ? "[useId] 必须在 setup 同步执行期间调用。" : "[useId] no instance");
  }

  let state = HOST_IDS.get(instance.host);
  if (!state) {
    state = { instance: null, cursor: 0, values: [] };
    HOST_IDS.set(instance.host, state);
  }
  if (state.instance !== instance) {
    state.instance = instance;
    state.cursor = 0;
  }

  const index = state.cursor++;
  const existing = state.values[index];
  if (existing) return existing;

  const value = `${normalizePrefix(prefix)}-${nextGlobalId().toString(36)}`;
  state.values[index] = value;
  return value;
};
