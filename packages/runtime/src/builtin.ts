// 内置组件 runtime helpers
//
// 编译器识别到 <Teleport>、<KeepAlive>、<component :is> 等内置标签时，
// 不会生成 createElement，而是直接调用这里的 helper。
//
// 这些 helper 都返回一个"占位 + 副作用"组合：返回一个 Comment 锚点节点，
// 然后在 effect 内做实际工作。

import { effectScope, getCurrentScope, onScopeDispose, useEffect } from "@elfui/reactivity";

import { DEV as __DEV__ } from "./dev";
import { ensureCustomElement } from "./element";
import { attachDevtoolsLogicalParent } from "./devtools";
import { getInstanceFromHost } from "./inject";
import { callHooks, getCurrentInstance } from "./lifecycle";

/** KeepAlive 标记 host 不会被卸载（即使从 DOM 中移除） */
export const ELF_KEEP_ALIVE_FLAG: unique symbol = Symbol("elfui.keep-alive");
/** KeepAlive 缓存释放时，让已断开的 ElfUI host 完成延迟卸载。 */
export const ELF_KEEP_ALIVE_RELEASE: unique symbol = Symbol("elfui.keep-alive-release");

// ---------- Teleport ----------

/**
 * 把内容渲染到目标容器（移出当前 DOM 位置）。
 *
 * @param to 目标选择器或 Element
 * @param disabled 是否禁用（disabled 时回退到锚点位置）
 * @param renderChildren 渲染子内容（返回 Node）
 */
export const teleport = (
  to: string | Element | (() => string | Element),
  disabled: boolean | (() => boolean),
  renderChildren: () => Node
): Node => {
  const anchor = document.createComment("teleport");
  const logicalOwner = __DEV__ ? (getCurrentInstance()?.host ?? null) : null;
  // 用 effectScope 隔离子内容的 effect
  const scope = effectScope(true);
  let mounted: Node | null = null;
  let lastTarget: Element | null = null;

  const apply = (): void => {
    const isDisabled = typeof disabled === "function" ? disabled() : disabled;
    const targetRaw = typeof to === "function" ? to() : to;
    const target =
      typeof targetRaw === "string"
        ? document.querySelector(targetRaw)
        : (targetRaw as Element | null);

    // 首次渲染
    if (!mounted) {
      mounted = scope.run(() => renderChildren()) as Node;
      if (__DEV__) attachDevtoolsLogicalParent(mounted, logicalOwner);
    }

    // 决定挂载位置
    const finalTarget = isDisabled ? anchor.parentNode : target;
    if (!finalTarget) return; // 目标找不到时不动

    if (isDisabled) {
      anchor.parentNode?.insertBefore(mounted, anchor);
    } else if (lastTarget !== finalTarget) {
      finalTarget.appendChild(mounted);
    }
    lastTarget = finalTarget as Element | null;
  };

  // 用 useEffect 触发响应式追踪；首次也要等 anchor 挂上后才能找 parent
  // 简单方案：用 microtask 延迟首次 apply
  let scheduled = false;
  useEffect(() => {
    // 读一遍依赖以建立追踪
    if (typeof to === "function") to();
    if (typeof disabled === "function") disabled();

    if (!scheduled) {
      scheduled = true;
      queueMicrotask(apply);
    } else {
      apply();
    }
  });

  return anchor;
};

export type LightDomProjectionTarget =
  | Element
  | null
  | undefined
  | (() => Element | null | undefined);

export interface LightDomProjectionOptions {
  /** 未声明 slot 的 light DOM 节点会移动到这里。 */
  defaultTarget?: LightDomProjectionTarget;
  /** 按 slot 名映射目标容器，例如 { footer: () => footerEl }。 */
  slots?: Record<string, LightDomProjectionTarget>;
  /** true 时，未匹配 slot 的节点也会进入 defaultTarget。默认跳过。 */
  includeUnmatchedSlots?: boolean;
}

export interface LightDomProjectionController {
  readonly projected: boolean;
  project(): boolean;
  restore(): void;
}

/**
 * 把 host 的真实 light DOM 节点移动到指定容器，并可在关闭/卸载时还原。
 *
 * 用于 Dialog/Drawer 这类 Teleport 组件：原生 <slot> 被传送到 body 后不会继续投射，
 * 因此需要移动真实节点而不是 clone，才能保留事件监听与节点状态。
 */
export const projectLightDom = (
  host: Node,
  options: LightDomProjectionOptions
): LightDomProjectionController => {
  let projected = false;
  let projectedNodes: Node[] = [];

  return {
    get projected() {
      return projected;
    },
    project() {
      if (projected) return true;

      const moves: Array<{ node: Node; target: Element }> = [];
      const nodes = Array.from(host.childNodes);
      for (const node of nodes) {
        const slot = node instanceof Element ? node.getAttribute("slot") : null;
        const hasSlotTarget =
          slot !== null &&
          !!options.slots &&
          Object.prototype.hasOwnProperty.call(options.slots, slot);
        const target =
          hasSlotTarget && slot !== null
            ? resolveProjectionTarget(options.slots?.[slot])
            : slot === null || options.includeUnmatchedSlots
              ? resolveProjectionTarget(options.defaultTarget)
              : null;

        if (!target) {
          if (slot === null || hasSlotTarget || options.includeUnmatchedSlots) return false;
          continue;
        }

        moves.push({ node, target });
      }

      for (const { node, target } of moves) {
        target.appendChild(node);
      }
      projectedNodes = moves.map(({ node }) => node);
      projected = true;
      return true;
    },
    restore() {
      if (!projected) return;
      for (const node of projectedNodes) {
        host.appendChild(node);
      }
      projectedNodes = [];
      projected = false;
    }
  };
};

const resolveProjectionTarget = (target: LightDomProjectionTarget): Element | null => {
  return typeof target === "function" ? (target() ?? null) : (target ?? null);
};

// ---------- 动态组件 ----------

/**
 * <component :is="..."> 实现。
 * @param getCtor 返回构造器（CustomElementConstructor）/ 标签字符串 / null
 * @param applyProps 给元素设置 props/attrs（编译器生成）
 */
export const dynamicComponent = (
  getCtor: () => CustomElementConstructor | string | null | undefined,
  applyProps?: (el: HTMLElement) => void
): Node => {
  const anchor = document.createComment("component");
  const logicalOwner = __DEV__ ? (getCurrentInstance()?.host ?? null) : null;
  let current: HTMLElement | null = null;
  let lastKey: unknown = undefined;

  const apply = (): void => {
    const c = getCtor();
    if (c === lastKey) return;
    lastKey = c;

    if (current) {
      current.parentNode?.removeChild(current);
      current = null;
    }
    if (!c) return;

    let el: HTMLElement;
    if (typeof c === "string") {
      el = document.createElement(c);
    } else {
      const ctor = c as unknown as { __elfDefinition?: { tag?: string } };
      const tag = ctor?.__elfDefinition?.tag;
      if (tag) {
        el = document.createElement(ensureCustomElement(c));
      } else {
        el = new (c as new () => HTMLElement)();
      }
    }
    if (applyProps) applyProps(el);
    if (__DEV__) attachDevtoolsLogicalParent(el, logicalOwner);
    anchor.parentNode?.insertBefore(el, anchor);
    current = el;
  };

  let scheduled = false;
  useEffect(() => {
    getCtor(); // 建立依赖追踪
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(apply);
    } else {
      apply();
    }
  });

  return anchor;
};

// ---------- KeepAlive ----------

interface KeepAliveCacheEntry {
  key: string;
  el: HTMLElement;
  scope: ReturnType<typeof effectScope>;
  cached: boolean;
}

/**
 * KeepAlive 包裹动态组件，缓存实例避免每次切换重建。
 *
 * @param getKey 当前激活的 key（用于查找缓存）
 * @param factory key -> Element（创建一个组件实例）
 * @param options include / exclude / max
 */
export const keepAlive = (
  getKey: () => string | undefined,
  factory: (key: string) => HTMLElement,
  options: KeepAliveOptions = {}
): Node => {
  const anchor = document.createComment("keep-alive");
  const logicalOwner = __DEV__ ? (getCurrentInstance()?.host ?? null) : null;
  const cache = new Map<string, KeepAliveCacheEntry>();
  // LRU 顺序追踪
  const order: string[] = [];
  let active: KeepAliveCacheEntry | null = null;
  let disposed = false;

  const shouldCache = (key: string): boolean => {
    if (options.exclude && matchPattern(key, options.exclude)) return false;
    if (options.include && !matchPattern(key, options.include)) return false;
    return true;
  };

  const releaseEntry = (entry: KeepAliveCacheEntry): void => {
    entry.scope.stop();
    const host = entry.el as unknown as Record<symbol, unknown>;
    host[ELF_KEEP_ALIVE_FLAG] = false;
    entry.el.remove();
    const release = host[ELF_KEEP_ALIVE_RELEASE];
    host[ELF_KEEP_ALIVE_RELEASE] = undefined;
    if (typeof release === "function") release();
  };

  const evict = (): void => {
    if (!options.max || cache.size <= options.max) return;
    while (cache.size > options.max) {
      const oldest = order.shift();
      if (!oldest) break;
      const entry = cache.get(oldest);
      if (entry && entry !== active) {
        cache.delete(oldest);
        releaseEntry(entry);
      }
    }
  };

  const apply = (): void => {
    if (disposed) return;
    const key = getKey();

    if (active) {
      const previous = active;
      active = null;
      const idx = order.indexOf(previous.key);
      if (idx >= 0) {
        order.splice(idx, 1);
        order.push(previous.key);
      }
      // 触发 deactivated（缓存中保留，仅从 DOM 移除）
      const oldInst = getInstanceFromHost(previous.el);
      if (oldInst) callHooks(oldInst.deactivatedHooks, oldInst, "component deactivated hook");
      previous.el.remove();
      if (!previous.cached) releaseEntry(previous);
    }

    if (!key) return;

    let entry = cache.get(key);
    if (!entry) {
      const scope = effectScope(true);
      const el = scope.run(() => factory(key)) as HTMLElement;
      if (__DEV__) attachDevtoolsLogicalParent(el, logicalOwner);
      const cached = shouldCache(key);
      // 标记此 host 处于 KeepAlive 控制下：detach 时不要触发 unmount
      (el as unknown as Record<symbol, unknown>)[ELF_KEEP_ALIVE_FLAG] = true;
      entry = { key, el, scope, cached };
      if (cached) {
        cache.set(key, entry);
        order.push(key);
        evict();
      } else {
        // 不在缓存里：detach 时正常卸载
        (el as unknown as Record<symbol, unknown>)[ELF_KEEP_ALIVE_FLAG] = false;
      }
    } else {
      const idx = order.indexOf(key);
      if (idx >= 0) {
        order.splice(idx, 1);
        order.push(key);
      }
    }

    anchor.parentNode?.insertBefore(entry.el, anchor);
    // 触发 activated（首次创建时也算 activated；onMounted 会先于 activated 调用）
    queueMicrotask(() => {
      if (disposed || active !== entry || !entry.el.isConnected) return;
      const inst = getInstanceFromHost(entry!.el);
      if (inst) {
        // 首次创建：等 mounted 完成（mounted 在 connectedCallback 内同步触发，
        // 但 attachInstanceToHost 也已经做完了，所以这里 inst 一定可用）
        callHooks(inst.activatedHooks, inst, "component activated hook");
      }
    });

    active = entry;
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (disposed) return;
      disposed = true;

      const entries = new Set(cache.values());
      if (active) {
        const inst = getInstanceFromHost(active.el);
        if (inst) callHooks(inst.deactivatedHooks, inst, "component deactivated hook");
        entries.add(active);
      }
      active = null;
      cache.clear();
      order.length = 0;
      for (const entry of entries) releaseEntry(entry);
    });
  }

  let scheduled = false;
  useEffect(() => {
    getKey(); // 建立依赖追踪
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(apply);
    } else {
      apply();
    }
  });

  return anchor;
};

export interface KeepAliveOptions {
  include?: string | RegExp | (string | RegExp)[];
  exclude?: string | RegExp | (string | RegExp)[];
  max?: number;
}

const matchPattern = (s: string, pattern: string | RegExp | (string | RegExp)[]): boolean => {
  const list = Array.isArray(pattern) ? pattern : [pattern];
  for (const p of list) {
    if (typeof p === "string") {
      if (p === s) return true;
      if (
        p
          .split(",")
          .map((x) => x.trim())
          .includes(s)
      )
        return true;
    } else if (p.test(s)) {
      return true;
    }
  }
  return false;
};
