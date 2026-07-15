import type { ReactiveEffect } from "./effect";

const DEVTOOLS_GLOBAL_HOOK = "__ELFUI_DEVTOOLS_GLOBAL_HOOK__";
const COMPONENT_CONTEXT_KEY: unique symbol = Symbol.for(
  "elfui.devtools.component-context"
) as never;

export interface ReactivityTriggerEvent {
  type: "reactivity:trigger";
  id: string;
  parentTriggerId: string | null;
  targetId: string;
  targetName?: string;
  key: string;
  effects: Array<{
    effectId: string;
    componentId: string | null;
    debug?: ReactivityEffectDebugInfo;
  }>;
}

export interface ReactivityEffectDebugInfo {
  kind: "binding" | "computed" | "watch" | "effect" | string;
  name?: string;
  source?: { line: number; column: number };
}

export interface ReactivityEffectEvent {
  type: "reactivity:effect";
  triggerId: string;
  effectId: string;
  componentId: string | null;
  debug?: ReactivityEffectDebugInfo;
  duration: number;
}

export type ReactivityDevtoolsEvent = ReactivityTriggerEvent | ReactivityEffectEvent;

interface ReactivityDevtoolsHook {
  emitReactivityEvent?(event: ReactivityDevtoolsEvent): void;
  isTimelineRecording?(): boolean;
}

const targetIds = new WeakMap<object, string>();
const targetNames = new WeakMap<object, string>();
let nextTargetId = 1;
let nextEffectId = 1;
let nextTriggerId = 1;
let activeTriggerId: string | null = null;

const getHook = (): ReactivityDevtoolsHook | null => {
  if (!__DEV__) return null;
  const hook = (globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL_HOOK];
  return hook && typeof hook === "object" ? (hook as ReactivityDevtoolsHook) : null;
};

const keyText = (key: unknown): string => {
  if (typeof key === "symbol") return key.description ? `Symbol(${key.description})` : "Symbol";
  if (Array.isArray(key)) return key.map(keyText).join(", ");
  try {
    return String(key);
  } catch {
    return "<unknown>";
  }
};

const emit = (event: ReactivityDevtoolsEvent): void => {
  const handler = getHook()?.emitReactivityEvent;
  if (!handler) return;
  try {
    handler(event);
  } catch (error) {
    if (__DEV__) console.warn("[elfui:devtools] reactivity hook failed", error);
  }
};

export const createReactivityEffectId = (): string => `elfui-effect:${nextEffectId++}`;

export const getReactivityComponentContext = (): string | null => {
  if (!__DEV__) return null;
  const value = (globalThis as unknown as Record<symbol, unknown>)[COMPONENT_CONTEXT_KEY];
  return typeof value === "string" ? value : null;
};

export const setReactivityDebugName = (target: object, name?: string): void => {
  if (!__DEV__ || !name) return;
  targetNames.set(target, name);
};

export const emitReactivityTrigger = (
  target: object,
  key: unknown,
  effects: readonly ReactiveEffect[]
): string | null => {
  const hook = getHook();
  if (
    !__DEV__ ||
    typeof hook?.emitReactivityEvent !== "function" ||
    hook.isTimelineRecording?.() === false
  )
    return null;
  let targetId = targetIds.get(target);
  if (!targetId) {
    targetId = `elfui-target:${nextTargetId++}`;
    targetIds.set(target, targetId);
  }
  const id = `elfui-trigger:${nextTriggerId++}`;
  const targetName = targetNames.get(target);
  emit({
    type: "reactivity:trigger",
    id,
    parentTriggerId: activeTriggerId,
    targetId,
    ...(targetName ? { targetName } : {}),
    key: keyText(key),
    effects: effects.map((effect) => ({
      effectId: effect.devtoolsId,
      componentId: effect.devtoolsComponentId,
      ...(effect.devtoolsDebug ? { debug: effect.devtoolsDebug } : {})
    }))
  });
  return id;
};

export const withReactivityTrigger = <T>(triggerId: string | null, run: () => T): T => {
  if (!__DEV__ || !triggerId) return run();
  const previous = activeTriggerId;
  activeTriggerId = triggerId;
  try {
    return run();
  } finally {
    activeTriggerId = previous;
  }
};

export const emitReactivityEffect = (
  triggerId: string,
  effectId: string,
  componentId: string | null,
  debug: ReactivityEffectDebugInfo | undefined,
  duration: number
): void => {
  if (!__DEV__) return;
  emit({
    type: "reactivity:effect",
    triggerId,
    effectId,
    componentId,
    ...(debug ? { debug } : {}),
    duration
  });
};

export const reactivityNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();
