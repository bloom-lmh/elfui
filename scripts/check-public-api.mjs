import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";
import ts from "typescript";

const repoRoot = process.cwd();
const packageRoots = [path.join(repoRoot, "packages"), path.join(repoRoot, "extensions")];
const snapshotPath = path.join(repoRoot, "docs", "PUBLIC-API-SNAPSHOT.json");
const writeMode = process.argv.includes("--write");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const toPublicEntryName = (packageName, exportName) => {
  if (exportName === ".") return packageName;
  return `${packageName}/${exportName.replace(/^\.\//, "")}`;
};

const toSourceEntry = (packageDir, importPath) => {
  if (!importPath.startsWith("./dist/") || !importPath.endsWith(".js")) {
    return undefined;
  }
  return path.join(packageDir, importPath.replace("./dist/", "src/").replace(/\.js$/, ".ts"));
};

const collectEntryPoints = () => {
  const entryPoints = [];
  for (const packagesRoot of packageRoots) {
    if (!existsSync(packagesRoot)) continue;

    for (const dirent of readdirSync(packagesRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;

      const packageDir = path.join(packagesRoot, dirent.name);
      const packageJsonPath = path.join(packageDir, "package.json");
      if (!existsSync(packageJsonPath)) continue;

      const packageJson = readJson(packageJsonPath);
      const exportsField = packageJson.exports ?? {};

      for (const [exportName, config] of Object.entries(exportsField)) {
        const importPath = typeof config === "string" ? config : config?.import;
        if (typeof importPath !== "string") continue;

        const sourceFile = toSourceEntry(packageDir, importPath);
        if (sourceFile === undefined) continue;
        if (!existsSync(sourceFile)) {
          throw new Error(
            `Public export ${packageJson.name}${exportName} points to missing source: ${sourceFile}`
          );
        }

        entryPoints.push({
          entry: toPublicEntryName(packageJson.name, exportName),
          sourceFile
        });
      }
    }
  }

  return entryPoints.sort((a, b) => a.entry.localeCompare(b.entry));
};

const readCompilerOptions = () => {
  const configPath = path.join(repoRoot, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  if (parsed.errors.length > 0) {
    const message = parsed.errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("\n");
    throw new Error(message);
  }

  return parsed.options;
};

const classifySymbol = (symbol) => {
  const kinds = [];
  const flags = symbol.flags;

  if ((flags & ts.SymbolFlags.Value) !== 0) kinds.push("value");
  if ((flags & ts.SymbolFlags.Type) !== 0) kinds.push("type");
  if ((flags & ts.SymbolFlags.Namespace) !== 0) kinds.push("namespace");

  return kinds.length > 0 ? kinds : ["unknown"];
};

const normalizeSignature = (value) => value.replace(/\s+/gu, " ").trim();

const hasModifier = (node, kind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((item) => item.kind === kind);

const collectSymbolSignature = (checker, symbol) => {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration) return symbol.getName();
  const formatFlags =
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.WriteArrowStyleSignature |
    ts.TypeFormatFlags.UseFullyQualifiedType;
  const typeText = (type, location = declaration) =>
    checker.typeToString(type, location, formatFlags);
  const signatureText = (signature, location = declaration) =>
    checker.signatureToString(signature, location, formatFlags);
  const parts = [];

  if ((symbol.flags & ts.SymbolFlags.Value) !== 0) {
    const valueType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const calls = valueType.getCallSignatures().map((signature) => signatureText(signature));
    const constructs = valueType
      .getConstructSignatures()
      .map((signature) => `new ${signatureText(signature)}`);
    parts.push(`value ${[...calls, ...constructs].join(" | ") || typeText(valueType)}`);
  }

  if ((symbol.flags & ts.SymbolFlags.Type) !== 0) {
    const typeDeclaration = symbol.declarations?.find(
      (item) =>
        ts.isInterfaceDeclaration(item) ||
        ts.isClassDeclaration(item) ||
        ts.isTypeAliasDeclaration(item) ||
        ts.isEnumDeclaration(item)
    );
    if (typeDeclaration && ts.isTypeAliasDeclaration(typeDeclaration)) {
      const parameters = typeDeclaration.typeParameters?.map((item) => item.getText()).join(", ");
      parts.push(`type${parameters ? `<${parameters}>` : ""} = ${typeDeclaration.type.getText()}`);
    } else if (typeDeclaration && ts.isEnumDeclaration(typeDeclaration)) {
      parts.push(
        `enum { ${typeDeclaration.members.map((member) => member.getText()).join("; ")} }`
      );
    } else {
      const declaredType = checker.getDeclaredTypeOfSymbol(symbol);
      const properties = checker
        .getPropertiesOfType(declaredType)
        .filter((property) =>
          (property.declarations ?? []).every(
            (item) =>
              !hasModifier(item, ts.SyntaxKind.PrivateKeyword) &&
              !hasModifier(item, ts.SyntaxKind.ProtectedKeyword)
          )
        )
        .map((property) => {
          const propertyDeclaration = property.valueDeclaration ?? property.declarations?.[0];
          const propertyType = checker.getTypeOfSymbolAtLocation(
            property,
            propertyDeclaration ?? declaration
          );
          const readonly = (property.declarations ?? []).some((item) =>
            hasModifier(item, ts.SyntaxKind.ReadonlyKeyword)
          );
          const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
          return `${readonly ? "readonly " : ""}${property.getName()}${optional ? "?" : ""}: ${typeText(
            propertyType,
            propertyDeclaration ?? declaration
          )}`;
        })
        .sort();
      const calls = declaredType
        .getCallSignatures()
        .map((signature) => `call ${signatureText(signature)}`);
      const constructs = declaredType
        .getConstructSignatures()
        .map((signature) => `new ${signatureText(signature)}`);
      const indices = checker
        .getIndexInfosOfType(declaredType)
        .map(
          (info) =>
            `${info.isReadonly ? "readonly " : ""}[key: ${typeText(info.keyType)}]: ${typeText(
              info.type
            )}`
        );
      const parameters = typeDeclaration?.typeParameters?.map((item) => item.getText()).join(", ");
      parts.push(
        `type${parameters ? `<${parameters}>` : ""} { ${[
          ...properties,
          ...calls,
          ...constructs,
          ...indices
        ].join("; ")} }`
      );
    }
  }

  return normalizeSignature(parts.join(" ; "));
};

const collectApiSnapshot = () => {
  const entryPoints = collectEntryPoints();
  const program = ts.createProgram(
    entryPoints.map((entryPoint) => entryPoint.sourceFile),
    readCompilerOptions()
  );
  const checker = program.getTypeChecker();

  const entries = {};
  for (const entryPoint of entryPoints) {
    const sourceFile = program.getSourceFile(entryPoint.sourceFile);
    if (sourceFile === undefined) {
      throw new Error(
        `Unable to read source file for ${entryPoint.entry}: ${entryPoint.sourceFile}`
      );
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) {
      entries[entryPoint.entry] = [];
      continue;
    }

    entries[entryPoint.entry] = checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => {
        const target =
          (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        return {
          name: symbol.getName(),
          kind: classifySymbol(target).sort(),
          signature: collectSymbolSignature(checker, target)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    schemaVersion: 2,
    note: "Generated by npm run gen:public-api. Review intentional API changes before updating.",
    entries
  };
};

const formatSnapshot = async (snapshot) => {
  return prettier.format(JSON.stringify(snapshot), { parser: "json" });
};

const normalizeLineEndings = (content) => content.replace(/\r\n/g, "\n");

const diffEntries = (expected, actual) => {
  const messages = [];
  const entryNames = new Set([...Object.keys(expected.entries), ...Object.keys(actual.entries)]);

  for (const entryName of [...entryNames].sort()) {
    const before = new Map((expected.entries[entryName] ?? []).map((item) => [item.name, item]));
    const after = new Map((actual.entries[entryName] ?? []).map((item) => [item.name, item]));
    const added = [...after.keys()].filter((name) => !before.has(name)).sort();
    const removed = [...before.keys()].filter((name) => !after.has(name)).sort();
    const changed = [...after.keys()]
      .filter(
        (name) =>
          before.has(name) && JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))
      )
      .sort();

    if (added.length > 0) {
      messages.push(`${entryName}: added ${added.join(", ")}`);
    }
    if (removed.length > 0) {
      messages.push(`${entryName}: removed ${removed.join(", ")}`);
    }
    if (changed.length > 0) {
      messages.push(`${entryName}: changed ${changed.join(", ")}`);
    }
  }

  return messages;
};

const snapshot = collectApiSnapshot();
const nextContent = await formatSnapshot(snapshot);

if (writeMode) {
  writeFileSync(snapshotPath, nextContent);
  console.log(`public API snapshot written to ${path.relative(repoRoot, snapshotPath)}`);
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  console.error("Missing public API snapshot. Run npm run gen:public-api.");
  process.exit(1);
}

const currentContent = readFileSync(snapshotPath, "utf8");
if (normalizeLineEndings(currentContent) !== normalizeLineEndings(nextContent)) {
  const expected = JSON.parse(currentContent);
  const messages = diffEntries(expected, snapshot);
  console.error("Public API snapshot changed.");
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  console.error("\nIf this change is intentional, run npm run gen:public-api and review the diff.");
  process.exit(1);
}

console.log("public API snapshot check passed.");
