import * as ts from "typescript";

export type TemplateValueHelper = "readTemplateValue" | "writeTemplateValue";

export interface TransformTemplateValueOptions {
  stateExpression: string;
  castReads?: boolean;
}

export interface TransformTemplateValueResult {
  code: string;
  helpers: Set<TemplateValueHelper>;
}

export interface TemplateStatePath {
  root: string;
  property?: string | undefined;
}

export interface TemplateExpressionIR extends TransformTemplateValueResult {
  source: string;
  empty: boolean;
  /** Identifier 或普通点访问链，可作为事件函数引用读取后调用。 */
  simpleReference: boolean;
  /** 可由 state 直接写入的单层路径，例如 count 或 record.value。 */
  statePath: TemplateStatePath | null;
  /** 表达式实际读取的根标识符；解析失败时为 null，调用方应保守回退。 */
  referencedRoots: ReadonlySet<string> | null;
}

const parseExpression = (
  source: string
): { expression: ts.Expression; sourceFile: ts.SourceFile } | null => {
  const sourceFile = ts.createSourceFile(
    "template-expression.ts",
    `const __elfExpression = (${source});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
  ).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) return null;
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return null;
  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) return null;
  return {
    expression: ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer,
    sourceFile
  };
};

const directValueAccess = (
  expression: ts.Expression
): { root: ts.Identifier; optional: boolean } | null => {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  if (expression.name.text !== "value" || !ts.isIdentifier(expression.expression)) return null;
  return {
    root: expression.expression,
    optional: expression.questionDotToken !== undefined
  };
};

const isSimpleReference = (expression: ts.Expression): boolean => {
  if (ts.isIdentifier(expression)) return true;
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.questionDotToken === undefined &&
    isSimpleReference(expression.expression)
  );
};

const readStatePath = (expression: ts.Expression): TemplateStatePath | null => {
  if (ts.isIdentifier(expression)) return { root: expression.text };
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.questionDotToken === undefined &&
    ts.isIdentifier(expression.expression)
  ) {
    return { root: expression.expression.text, property: expression.name.text };
  }
  return null;
};

const collectReferencedRoots = (expression: ts.Expression): ReadonlySet<string> => {
  const roots = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) &&
          parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node);
      const isDeclaration =
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node);
      if (!isPropertyName && !isDeclaration) roots.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return roots;
};

const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

const isWriteTarget = (node: ts.Expression): boolean => {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    return isAssignmentOperator(parent.operatorToken.kind);
  }
  return (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken ||
      parent.operator === ts.SyntaxKind.MinusMinusToken)
  );
};

/**
 * 把模板中的根标识符 `.value` 访问改写成语义化 runtime helper。
 * TypeScript AST 保证字符串、注释、模板文本和普通 token 不会被误改写。
 */
export const createTemplateExpressionIR = (
  source: string,
  options: TransformTemplateValueOptions
): TemplateExpressionIR => {
  const parsed = parseExpression(source);
  const parsedState = parseExpression(options.stateExpression);
  if (!parsed || !parsedState) {
    return {
      source,
      code: source,
      helpers: new Set(),
      empty: source.trim().length === 0,
      simpleReference: false,
      statePath: null,
      referencedRoots: null
    };
  }

  const helpers = new Set<TemplateValueHelper>();
  const printer = ts.createPrinter({ removeComments: false });
  const transformed = ts.transform(parsed.expression, [
    (context) => {
      const visitor: ts.Visitor = (node) => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const target = directValueAccess(node.left);
          if (target) {
            helpers.add("writeTemplateValue");
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("writeTemplateValue"),
              undefined,
              [
                parsedState.expression,
                ts.factory.createStringLiteral(target.root.text),
                target.root,
                ts.visitNode(node.right, visitor) as ts.Expression
              ]
            );
          }
        }

        if (ts.isPropertyAccessExpression(node)) {
          const target = directValueAccess(node);
          if (target && !isWriteTarget(node)) {
            helpers.add("readTemplateValue");
            let read: ts.Expression = ts.factory.createCallExpression(
              ts.factory.createIdentifier("readTemplateValue"),
              undefined,
              [
                parsedState.expression,
                ts.factory.createStringLiteral(target.root.text),
                target.root,
                target.optional ? ts.factory.createTrue() : ts.factory.createFalse()
              ]
            );
            if (options.castReads) {
              read = ts.factory.createAsExpression(
                read,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
              );
            }
            return read;
          }
        }

        return ts.visitEachChild(node, visitor, context);
      };
      return (root) => ts.visitNode(root, visitor) as ts.Expression;
    }
  ]);

  try {
    return {
      source,
      code: printer.printNode(
        ts.EmitHint.Expression,
        transformed.transformed[0]!,
        parsed.sourceFile
      ),
      helpers,
      empty: false,
      simpleReference: isSimpleReference(parsed.expression),
      statePath: readStatePath(parsed.expression),
      referencedRoots: collectReferencedRoots(parsed.expression)
    };
  } finally {
    transformed.dispose();
  }
};

export const transformTemplateValueAccess = (
  source: string,
  options: TransformTemplateValueOptions
): TransformTemplateValueResult => {
  const { code, helpers } = createTemplateExpressionIR(source, options);
  return { code, helpers };
};
