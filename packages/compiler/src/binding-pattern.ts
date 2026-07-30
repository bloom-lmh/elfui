import * as ts from "typescript";

const collectBindingNames = (name: ts.BindingName, out: string[]): void => {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, out);
  }
};

export const getBindingPatternNames = (pattern: string): string[] => {
  const source = ts.createSourceFile(
    "elfui-binding-pattern.ts",
    `const ${pattern} = __scope;`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const statement = source.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return [];
  const declaration = statement.declarationList.declarations[0];
  if (!declaration) return [];
  const names: string[] = [];
  collectBindingNames(declaration.name, names);
  return names;
};
