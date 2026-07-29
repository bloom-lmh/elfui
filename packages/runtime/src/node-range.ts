export type NodeRange = Node[];

export const captureNodeRange = (node: Node | null): NodeRange => {
  if (!node) return [];
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? Array.from(node.childNodes) : [node];
};

export const insertNodeRange = (
  parent: Node,
  nodes: readonly Node[],
  reference: Node | null = null
): void => {
  for (const node of nodes) {
    parent.insertBefore(node, reference);
  }
};

export const removeNodeRange = (nodes: readonly Node[]): void => {
  for (const node of nodes) {
    node.parentNode?.removeChild(node);
  }
};
