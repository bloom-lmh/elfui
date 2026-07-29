import { effectScope, getCurrentScope, onScopeDispose, useEffect } from "@elfui/reactivity";

export interface TransitionHooks {
  onBeforeEnter?: (el: Element) => void;
  onEnter?: (el: Element, done: () => void) => void;
  onAfterEnter?: (el: Element) => void;
  onBeforeLeave?: (el: Element) => void;
  onLeave?: (el: Element, done: () => void) => void;
  onAfterLeave?: (el: Element) => void;
}

export interface TransitionOptions extends TransitionHooks {
  name?: string;
  appear?: boolean;
  duration?: number | { enter: number; leave: number };
  css?: boolean;
}

interface TransitionChild {
  el: Element;
  scope: ReturnType<typeof effectScope>;
}

interface AnimationJob {
  cancel(): void;
}

const cls = (name: string | undefined, kind: string): string =>
  name ? `${name}-${kind}` : `v-${kind}`;

const addClass = (el: Element, ...classes: string[]): void => {
  el.classList.add(...classes);
};

const removeClass = (el: Element, ...classes: string[]): void => {
  el.classList.remove(...classes);
};

export const transition = (
  anchor: Comment,
  getRender: () => Element | null,
  options: TransitionOptions = {}
): void => {
  const useCss = options.css !== false;
  const enterDuration =
    typeof options.duration === "object" ? options.duration.enter : options.duration;
  const leaveDuration =
    typeof options.duration === "object" ? options.duration.leave : options.duration;

  let current: TransitionChild | null = null;
  let firstRun = true;
  let disposed = false;
  const children = new Set<TransitionChild>();
  const jobs = new Map<Element, AnimationJob>();

  const createChild = (): TransitionChild | null => {
    const scope = effectScope(true);
    const el = scope.run(getRender) ?? null;
    if (!el) {
      scope.stop();
      return null;
    }
    const child = { el, scope };
    children.add(child);
    return child;
  };

  const releaseChild = (child: TransitionChild, remove = true): void => {
    jobs.get(child.el)?.cancel();
    jobs.delete(child.el);
    child.scope.stop();
    if (remove) child.el.parentNode?.removeChild(child.el);
    children.delete(child);
  };

  const createJob = (
    el: Element,
    onCancel: () => void
  ): {
    job: AnimationJob;
    addCleanup(cleanup: () => void): void;
    schedule(run: () => void): void;
    finish(run: () => void): void;
  } => {
    jobs.get(el)?.cancel();
    let active = true;
    const cleanups: Array<() => void> = [onCancel];
    const cleanup = (): void => {
      for (const fn of cleanups.splice(0)) fn();
    };
    const job: AnimationJob = {
      cancel() {
        if (!active) return;
        active = false;
        cleanup();
      }
    };
    jobs.set(el, job);
    return {
      job,
      addCleanup(fn) {
        cleanups.push(fn);
      },
      schedule(run) {
        const first = requestAnimationFrame(() => {
          const second = requestAnimationFrame(() => {
            if (active && !disposed) run();
          });
          cleanups.push(() => cancelAnimationFrame(second));
        });
        cleanups.push(() => cancelAnimationFrame(first));
      },
      finish(run) {
        if (!active || disposed) return;
        active = false;
        cleanup();
        if (jobs.get(el) === job) jobs.delete(el);
        run();
      }
    };
  };

  const waitForEnd = (
    el: Element,
    duration: number | undefined,
    finish: () => void,
    addCleanup: (cleanup: () => void) => void
  ): void => {
    const onEnd = (): void => finish();
    el.addEventListener("transitionend", onEnd);
    el.addEventListener("animationend", onEnd);
    addCleanup(() => {
      el.removeEventListener("transitionend", onEnd);
      el.removeEventListener("animationend", onEnd);
    });
    if (duration !== undefined) {
      const timer = setTimeout(finish, duration);
      addCleanup(() => clearTimeout(timer));
    }
  };

  const performEnter = (child: TransitionChild): void => {
    const { el } = child;
    options.onBeforeEnter?.(el);
    if (useCss) addClass(el, cls(options.name, "enter-from"), cls(options.name, "enter-active"));

    const controller = createJob(el, () => {
      if (useCss) {
        removeClass(
          el,
          cls(options.name, "enter-from"),
          cls(options.name, "enter-to"),
          cls(options.name, "enter-active")
        );
      }
    });
    controller.schedule(() => {
      if (useCss) {
        removeClass(el, cls(options.name, "enter-from"));
        addClass(el, cls(options.name, "enter-to"));
      }
      const finish = (): void =>
        controller.finish(() => {
          if (useCss) {
            removeClass(el, cls(options.name, "enter-to"), cls(options.name, "enter-active"));
          }
          options.onAfterEnter?.(el);
        });
      if (options.onEnter) {
        options.onEnter(el, finish);
      } else if (useCss) {
        waitForEnd(el, enterDuration, finish, controller.addCleanup);
      } else {
        finish();
      }
    });
  };

  const performLeave = (child: TransitionChild): void => {
    const { el } = child;
    options.onBeforeLeave?.(el);
    if (useCss) addClass(el, cls(options.name, "leave-from"), cls(options.name, "leave-active"));

    const controller = createJob(el, () => {
      if (useCss) {
        removeClass(
          el,
          cls(options.name, "leave-from"),
          cls(options.name, "leave-to"),
          cls(options.name, "leave-active")
        );
      }
    });
    controller.schedule(() => {
      if (useCss) {
        removeClass(el, cls(options.name, "leave-from"));
        addClass(el, cls(options.name, "leave-to"));
      }
      const finish = (): void =>
        controller.finish(() => {
          if (useCss) {
            removeClass(el, cls(options.name, "leave-to"), cls(options.name, "leave-active"));
          }
          options.onAfterLeave?.(el);
          releaseChild(child);
        });
      if (options.onLeave) {
        options.onLeave(el, finish);
      } else if (useCss) {
        waitForEnd(el, leaveDuration, finish, controller.addCleanup);
      } else {
        finish();
      }
    });
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      for (const job of jobs.values()) job.cancel();
      jobs.clear();
      for (const child of Array.from(children)) releaseChild(child);
      current = null;
    });
  }

  useEffect(() => {
    if (disposed) return;
    const next = createChild();
    const isFirst = firstRun;
    firstRun = false;

    if (isFirst) {
      if (next) {
        anchor.parentNode?.insertBefore(next.el, anchor);
        current = next;
        if (options.appear) performEnter(next);
      }
      return;
    }

    if (next && !current) {
      anchor.parentNode?.insertBefore(next.el, anchor);
      current = next;
      performEnter(next);
    } else if (!next && current) {
      const leaving = current;
      current = null;
      performLeave(leaving);
    } else if (next && current && next.el !== current.el) {
      const leaving = current;
      current = next;
      anchor.parentNode?.insertBefore(next.el, anchor);
      performEnter(next);
      performLeave(leaving);
    } else if (next) {
      releaseChild(next, false);
    }
  });
};
