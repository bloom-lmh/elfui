import { effectScope } from "@elfui/reactivity";

export const renderOnce = (render: () => Node): Node => {
  const scope = effectScope(true);
  const node = scope.run(render) as Node;
  scope.stop();
  return node;
};
