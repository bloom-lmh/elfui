import {
  batch,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  useEffect,
  useRef,
  type Ref
} from "@elfui/reactivity";

import { waitForCssEnd } from "./css-end";
import { DEV as __DEV__ } from "./dev";
import { longestIncreasingSubsequence } from "./keyed-reconcile";

export interface TransitionGroupOptions {
  name?: string;
  moveClass?: string;
  css?: boolean;
}

interface ItemState<T> {
  key: string | number;
  item: Ref<T>;
  index: Ref<number>;
  el: HTMLElement;
  scope: ReturnType<typeof effectScope>;
  pos?: { left: number; top: number };
}

const cls = (name: string | undefined, kind: string): string =>
  name ? `${name}-${kind}` : `v-${kind}`;

export const transitionGroup = <T>(
  host: HTMLElement,
  getItems: () => readonly T[],
  getKey: (item: T, index: number) => string | number,
  render: (item: Ref<T>, index: Ref<number>) => HTMLElement,
  options: TransitionGroupOptions = {}
): void => {
  const useCss = options.css !== false;
  const moveClass = options.moveClass ?? cls(options.name, "move");
  let prev: ItemState<T>[] = [];
  let firstRun = true;
  let disposed = false;
  const states = new Set<ItemState<T>>();
  const animationCleanups = new Set<() => void>();

  const registerCleanup = (cleanup: () => void): (() => void) => {
    let active = true;
    const registered = () => {
      if (!active) return;
      active = false;
      animationCleanups.delete(registered);
      cleanup();
    };
    animationCleanups.add(registered);
    return registered;
  };

  const scheduleFrames = (run: () => void): void => {
    let cancelFirst = (): void => undefined;
    let cancelSecond: (() => void) | undefined;
    const first = requestAnimationFrame(() => {
      cancelFirst();
      const second = requestAnimationFrame(() => {
        cancelSecond?.();
        if (!disposed) run();
      });
      cancelSecond = registerCleanup(() => cancelAnimationFrame(second));
    });
    cancelFirst = registerCleanup(() => cancelAnimationFrame(first));
  };

  const enterClasses = (el: HTMLElement): void => {
    if (!useCss) return;
    el.classList.add(cls(options.name, "enter-from"), cls(options.name, "enter-active"));
    scheduleFrames(() => {
      el.classList.remove(cls(options.name, "enter-from"));
      el.classList.add(cls(options.name, "enter-to"));
      const finish = (): void => {
        el.classList.remove(cls(options.name, "enter-to"), cls(options.name, "enter-active"));
      };
      waitForCssEnd(el, undefined, finish, registerCleanup);
    });
  };

  const leaveClasses = (state: ItemState<T>): void => {
    const { el } = state;
    state.scope.stop();
    if (!useCss) {
      el.parentNode?.removeChild(el);
      states.delete(state);
      return;
    }
    el.classList.add(cls(options.name, "leave-from"), cls(options.name, "leave-active"));
    scheduleFrames(() => {
      el.classList.remove(cls(options.name, "leave-from"));
      el.classList.add(cls(options.name, "leave-to"));
      const finish = (): void => {
        el.classList.remove(cls(options.name, "leave-to"), cls(options.name, "leave-active"));
        el.parentNode?.removeChild(el);
        states.delete(state);
      };
      waitForCssEnd(el, undefined, finish, registerCleanup);
    });
  };

  const flipMove = (items: ItemState<T>[]): void => {
    if (!useCss) return;
    const newPositions = items.map((state) => {
      const rect = state.el.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });
    const moved: ItemState<T>[] = [];
    for (let i = 0; i < items.length; i++) {
      const state = items[i]!;
      const next = newPositions[i]!;
      const previous = state.pos;
      if (!previous) continue;
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (dx !== 0 || dy !== 0) {
        state.el.style.transform = `translate(${dx}px, ${dy}px)`;
        state.el.style.transitionDuration = "0s";
        moved.push(state);
      }
    }
    for (let i = 0; i < items.length; i++) {
      items[i]!.pos = newPositions[i]!;
    }
    if (moved.length === 0) return;
    void host.offsetHeight;
    scheduleFrames(() => {
      for (const state of moved) {
        state.el.classList.add(moveClass);
        state.el.style.transform = "";
        state.el.style.transitionDuration = "";
        const onEnd = (): void => {
          state.el.classList.remove(moveClass);
        };
        waitForCssEnd(state.el, undefined, onEnd, registerCleanup);
      }
    });
  };

  const createState = (key: string | number, item: T, index: number): ItemState<T> => {
    const itemRef = useRef(item);
    const indexRef = useRef(index);
    const scope = effectScope(true);
    const el = scope.run(() => render(itemRef, indexRef)) as HTMLElement;
    const state = { key, item: itemRef, index: indexRef, el, scope };
    states.add(state);
    return state;
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      for (const cleanup of Array.from(animationCleanups)) cleanup();
      for (const state of states) {
        state.scope.stop();
        state.el.parentNode?.removeChild(state.el);
      }
      states.clear();
      prev = [];
    });
  }

  useEffect(() => {
    if (disposed) return;
    const items = getItems();
    const keys = new Array<string | number>(items.length);
    for (let index = 0; index < items.length; index++) {
      keys[index] = getKey(items[index] as T, index);
    }
    if (__DEV__) {
      const seen = new Set<string | number>();
      for (const key of keys) {
        if (seen.has(key)) console.warn(`[transitionGroup] duplicate key "${String(key)}".`, key);
        else seen.add(key);
      }
    }

    if (prev.length === items.length) {
      let sameKeyOrder = true;
      for (let index = 0; index < prev.length; index++) {
        if (prev[index]!.key !== keys[index]) {
          sameKeyOrder = false;
          break;
        }
      }
      if (sameKeyOrder) {
        if (!firstRun && useCss) {
          for (const state of prev) {
            const rect = state.el.getBoundingClientRect();
            state.pos = { left: rect.left, top: rect.top };
          }
        }
        batch(() => {
          for (let index = 0; index < prev.length; index++) {
            prev[index]!.item.set(items[index] as T);
            prev[index]!.index.set(index);
          }
        });
        if (!firstRun && useCss && prev.length > 0) flipMove(prev);
        firstRun = false;
        return;
      }
    }

    const oldByKey = new Map<string | number, ItemState<T>[]>();
    const oldIndexByState = new Map<ItemState<T>, number>();
    for (let index = 0; index < prev.length; index++) {
      const state = prev[index]!;
      const bucket = oldByKey.get(state.key);
      if (bucket) bucket.push(state);
      else oldByKey.set(state.key, [state]);
      oldIndexByState.set(state, index);
    }

    if (!firstRun && useCss) {
      for (const state of prev) {
        const rect = state.el.getBoundingClientRect();
        state.pos = { left: rect.left, top: rect.top };
      }
    }

    const next: ItemState<T>[] = [];
    const used = new Set<ItemState<T>>();
    const created: ItemState<T>[] = [];
    const oldIndices = new Array<number>(items.length).fill(0);

    batch(() => {
      for (let index = 0; index < items.length; index++) {
        const item = items[index] as T;
        const key = keys[index]!;
        const existing = oldByKey.get(key)?.shift();
        if (existing) {
          used.add(existing);
          existing.item.set(item);
          existing.index.set(index);
          next.push(existing);
          oldIndices[index] = (oldIndexByState.get(existing) ?? -1) + 1;
        } else {
          const state = createState(key, item, index);
          next.push(state);
          created.push(state);
        }
      }
    });

    for (const old of prev) {
      if (!used.has(old)) leaveClasses(old);
    }

    const stable = longestIncreasingSubsequence(oldIndices);
    let stableCursor = stable.length - 1;
    let reference: Node | null = null;
    for (let index = next.length - 1; index >= 0; index--) {
      const state = next[index]!;
      if (oldIndices[index] === 0 || stableCursor < 0 || index !== stable[stableCursor]) {
        host.insertBefore(state.el, reference);
      } else {
        stableCursor--;
      }
      reference = state.el;
    }
    for (const state of created) enterClasses(state.el);

    if (!firstRun) {
      const createdSet = new Set(created);
      const moving = next.filter((state) => !createdSet.has(state));
      if (moving.length > 0) flipMove(moving);
    }

    prev = next;
    firstRun = false;
  });
};
