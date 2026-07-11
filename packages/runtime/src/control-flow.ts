// 控制流原语 — branch / list / show
//
// 设计思路：所有控制流原语都使用一个 anchor 节点（注释节点）作为
// 插入点，子内容在 anchor 之前 / 之后插入，便于 mount / unmount。
//
// 这套 API 要让 codegen 输出的代码尽可能简单：
//   const anchor = mark();
//   parent.appendChild(anchor);
//   branch(anchor, () => state.show, [renderA, renderB]);
//
// 单元概念：
// - mark()：创建一个空注释节点作为锚
// - render(parent) / render(parentNode)：渲染函数返回 DocumentFragment 或 Node
//   也可以接收 (anchor) 自行决定挂载位置

import { effectScope, useEffect } from "@elfui/reactivity";

/** 创建一个用作锚的注释节点 */
export const mark = (label: string = ""): Comment => document.createComment(label);

/** 渲染函数：返回要插入的节点（或 DocumentFragment）；
 *  返回 null 表示什么都不插。 */
export type RenderBlock = () => Node | null;

// ---------- branch (v-if 等) ----------

/**
 * 根据 keyGetter 返回的索引切换 branches。
 *
 * @example v-if/v-else
 *   branch(anchor, () => visible.value ? 0 : 1, [
 *     () => createA(),
 *     () => createB()
 *   ]);
 *
 * @example v-show 之类的二元
 *   branch(anchor, () => state.show.value ? 0 : -1, [() => createNode()]);
 *   // -1 表示什么都不渲染
 */
export const branch = (
  anchor: Comment,
  keyGetter: () => number,
  branches: RenderBlock[],
  freeze = false
): void => {
  let currentKey = -2;
  let currentNodes: Node[] = [];
  let currentScope: ReturnType<typeof effectScope> | null = null;

  const cleanup = (): void => {
    for (const n of currentNodes) {
      n.parentNode?.removeChild(n);
    }
    currentNodes = [];
    if (currentScope) {
      currentScope.stop();
      currentScope = null;
    }
  };

  useEffect(() => {
    const key = keyGetter();
    if (key === currentKey) return;
    cleanup();
    currentKey = key;
    if (key < 0 || key >= branches.length) return;

    const block = branches[key];
    if (!block) return;

    // 在 detached scope 中渲染，确保 cleanup 时所有 effect 一并销毁
    const scope = effectScope(true);
    currentScope = scope;
    const node = scope.run(() => block());
    if (freeze) {
      scope.stop();
      currentScope = null;
    }
    if (node == null) return;

    if (node instanceof DocumentFragment) {
      currentNodes = Array.from(node.childNodes);
    } else {
      currentNodes = [node];
    }
    anchor.parentNode?.insertBefore(node, anchor);
  });
};

// ---------- list (v-for) ----------

/** v-for 的 render 签名：(item, index) => Node */
export type ListRender<T> = (item: T, index: number) => Node;

/** 主键提取器：拿到 item 的稳定 key */
export type ListKeyGetter<T> = (item: T, index: number) => string | number;

interface ListItem<T> {
  key: string | number;
  item: T;
  /** 渲染产生的所有 DOM 节点（fragment 时多于一个） */
  nodes: Node[];
  scope: ReturnType<typeof effectScope>;
}

const createListItem = <T>(
  key: string | number,
  item: T,
  index: number,
  render: ListRender<T>
): ListItem<T> => {
  const scope = effectScope(true);
  const rendered = scope.run(() => render(item, index)) as Node;
  // DocumentFragment 第一次 insert 后会变空，无法用作"持久节点引用"
  // 把它的子节点拍平成数组保存，以便后续重排 / 卸载时操作
  const nodes: Node[] =
    rendered.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */
      ? Array.from(rendered.childNodes)
      : [rendered];

  return { key, item, nodes, scope };
};

const removeListItem = <T>(item: ListItem<T>): void => {
  item.scope.stop();
  for (const node of item.nodes) {
    node.parentNode?.removeChild(node);
  }
};

const insertListItem = <T>(parent: Node, item: ListItem<T>, reference: Node): void => {
  for (const node of item.nodes) {
    parent.insertBefore(node, reference);
  }
};

const longestIncreasingSubsequence = (values: readonly number[]): number[] => {
  const predecessors = values.slice();
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i] as number;
    if (value === 0) continue;

    const lastResultIndex = result[result.length - 1];
    if (lastResultIndex === undefined || (values[lastResultIndex] as number) < value) {
      predecessors[i] = lastResultIndex ?? -1;
      result.push(i);
      continue;
    }

    let start = 0;
    let end = result.length - 1;
    while (start < end) {
      const middle = (start + end) >> 1;
      if ((values[result[middle] as number] as number) < value) {
        start = middle + 1;
      } else {
        end = middle;
      }
    }

    if (value < (values[result[start] as number] as number)) {
      predecessors[i] = start > 0 ? (result[start - 1] as number) : -1;
      result[start] = i;
    }
  }

  let cursor = result.length;
  let index = result[cursor - 1] as number | undefined;
  const sequence = new Array<number>(cursor);
  while (cursor-- > 0 && index !== undefined) {
    sequence[cursor] = index;
    index = predecessors[index] === -1 ? undefined : predecessors[index];
  }

  return sequence;
};

/**
 * keyed 列表渲染。
 *
 * @example
 *   list(anchor, () => items.value, (item) => item.id, (item, i) => createRow(item, i));
 *
 * 算法：keyed diff。先用 head/tail 快速路径复用稳定区间，再用 key map
 * 处理中间未知区间，最后通过 LIS 保留最长稳定子序列，只移动必要 DOM。
 */
export const list = <T>(
  anchor: Comment,
  itemsGetter: () => readonly T[],
  keyGetter: ListKeyGetter<T>,
  render: ListRender<T>
): void => {
  let prev: ListItem<T>[] = [];

  useEffect(() => {
    const raw = itemsGetter();
    // 显式建立长度追踪（让 push / 删除等数组变更也能被 effect 感知）
    const newItems: T[] = [];
    for (let i = 0; i < raw.length; i++) {
      newItems.push(raw[i] as T);
    }

    const newKeys = newItems.map((item, index) => keyGetter(item, index));
    if (__DEV__) {
      const seenKeys = new Set<string | number>();
      for (const key of newKeys) {
        if (seenKeys.has(key)) {
          console.warn(`[list] duplicate key "${String(key)}" detected.`, key);
        } else {
          seenKeys.add(key);
        }
      }
    }

    const next: Array<ListItem<T> | null> = new Array(newItems.length).fill(null);
    const newIndexToOldIndex = new Array<number>(newItems.length).fill(0);
    const usedOldItems = new Set<ListItem<T>>();

    let oldStart = 0;
    let oldEnd = prev.length - 1;
    let newStart = 0;
    let newEnd = newItems.length - 1;

    while (oldStart <= oldEnd && newStart <= newEnd) {
      const oldItem = prev[oldStart] as ListItem<T>;
      if (oldItem.key !== (newKeys[newStart] as string | number)) break;
      oldItem.item = newItems[newStart] as T;
      next[newStart] = oldItem;
      newIndexToOldIndex[newStart] = oldStart + 1;
      usedOldItems.add(oldItem);
      oldStart++;
      newStart++;
    }

    while (oldStart <= oldEnd && newStart <= newEnd) {
      const oldItem = prev[oldEnd] as ListItem<T>;
      if (oldItem.key !== (newKeys[newEnd] as string | number)) break;
      oldItem.item = newItems[newEnd] as T;
      next[newEnd] = oldItem;
      newIndexToOldIndex[newEnd] = oldEnd + 1;
      usedOldItems.add(oldItem);
      oldEnd--;
      newEnd--;
    }

    if (oldStart <= oldEnd && newStart <= newEnd) {
      const newIndexBuckets = new Map<string | number, number[]>();
      for (let i = newStart; i <= newEnd; i++) {
        const key = newKeys[i] as string | number;
        const bucket = newIndexBuckets.get(key);
        if (bucket) {
          bucket.push(i);
        } else {
          newIndexBuckets.set(key, [i]);
        }
      }

      for (let oldIndex = oldStart; oldIndex <= oldEnd; oldIndex++) {
        const oldItem = prev[oldIndex] as ListItem<T>;
        const bucket = newIndexBuckets.get(oldItem.key);
        const newIndex = bucket?.shift();
        if (newIndex === undefined) continue;
        oldItem.item = newItems[newIndex] as T;
        next[newIndex] = oldItem;
        newIndexToOldIndex[newIndex] = oldIndex + 1;
        usedOldItems.add(oldItem);
      }
    }

    for (const old of prev) {
      if (!usedOldItems.has(old)) {
        removeListItem(old);
      }
    }

    for (let i = 0; i < newItems.length; i++) {
      if (next[i]) continue;
      next[i] = createListItem(newKeys[i] as string | number, newItems[i] as T, i, render);
    }

    // 注意：每次重新查询 parent，因为 anchor 可能在挂载到 host 前后变换 parent
    const parent = anchor.parentNode;
    if (parent) {
      const stableSequence = longestIncreasingSubsequence(newIndexToOldIndex);
      let stableCursor = stableSequence.length - 1;
      let reference: Node = anchor;

      for (let i = next.length - 1; i >= 0; i--) {
        const current = next[i] as ListItem<T>;
        const firstNode = current.nodes[0];
        if (!firstNode) continue;

        if (newIndexToOldIndex[i] === 0) {
          insertListItem(parent, current, reference);
        } else if (stableCursor < 0 || i !== stableSequence[stableCursor]) {
          insertListItem(parent, current, reference);
        } else {
          stableCursor--;
        }

        reference = firstNode;
      }
    }

    prev = next as ListItem<T>[];
  });
};

// ---------- show (v-show) ----------

/** v-show：通过 style.display 切换显示，不卸载节点 */
export const show = (el: Element, getter: () => unknown): void => {
  const styled = el as HTMLElement | SVGElement;
  // 记录原始 display（可能是 inline-block / flex 等）
  const original = styled.style.display === "none" ? "" : styled.style.display;
  useEffect(() => {
    const v = getter();
    styled.style.display = v ? original : "none";
  });
};
