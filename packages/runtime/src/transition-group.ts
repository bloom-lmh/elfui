import {
  batch,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  useEffect,
  useRef,
  type Ref
} from "@elfui/reactivity";

export interface TransitionGroupOptions {
  name?: string;
  tag?: string;
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
        cleanup();
        el.classList.remove(cls(options.name, "enter-to"), cls(options.name, "enter-active"));
      };
      el.addEventListener("transitionend", finish);
      const cleanup = registerCleanup(() => el.removeEventListener("transitionend", finish));
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
        cleanup();
        el.classList.remove(cls(options.name, "leave-to"), cls(options.name, "leave-active"));
        el.parentNode?.removeChild(el);
        states.delete(state);
      };
      el.addEventListener("transitionend", finish);
      const cleanup = registerCleanup(() => el.removeEventListener("transitionend", finish));
    });
  };

  const flipMove = (items: ItemState<T>[]): void => {
    if (!useCss) return;
    const newPositions = items.map((state) => {
      const rect = state.el.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });
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
      }
    }
    void host.offsetHeight;
    scheduleFrames(() => {
      for (const state of items) {
        state.el.classList.add(moveClass);
        state.el.style.transform = "";
        state.el.style.transitionDuration = "";
        const onEnd = (event: TransitionEvent): void => {
          if (event.target !== state.el) return;
          cleanup();
          state.el.classList.remove(moveClass);
        };
        state.el.addEventListener("transitionend", onEnd as EventListener);
        const cleanup = registerCleanup(() =>
          state.el.removeEventListener("transitionend", onEnd as EventListener)
        );
      }
    });
    for (let i = 0; i < items.length; i++) {
      items[i]!.pos = newPositions[i]!;
    }
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
    const oldByKey = new Map<string | number, ItemState<T>>();
    for (const state of prev) oldByKey.set(state.key, state);

    if (!firstRun && useCss) {
      for (const state of prev) {
        const rect = state.el.getBoundingClientRect();
        state.pos = { left: rect.left, top: rect.top };
      }
    }

    const next: ItemState<T>[] = [];
    const used = new Set<string | number>();
    const created: ItemState<T>[] = [];

    batch(() => {
      for (let index = 0; index < items.length; index++) {
        const item = items[index] as T;
        const key = getKey(item, index);
        const existing = oldByKey.get(key);
        if (existing && !used.has(key)) {
          used.add(key);
          existing.item.set(item);
          existing.index.set(index);
          next.push(existing);
        } else {
          const state = createState(key, item, index);
          next.push(state);
          created.push(state);
        }
      }
    });

    for (const old of prev) {
      if (!used.has(old.key)) leaveClasses(old);
    }

    for (const state of next) {
      if (state.el.parentNode === host) host.removeChild(state.el);
    }
    for (const state of next) host.appendChild(state.el);
    for (const state of created) enterClasses(state.el);

    if (!firstRun) {
      const moving = next.filter((state) => !created.includes(state));
      if (moving.length > 0) flipMove(moving);
    }

    prev = next;
    firstRun = false;
  });
};
