import { describe, expect, it } from "vitest";

import { createTemplateExpressionIR } from "../expression";

const analyze = (source: string) =>
  createTemplateExpressionIR(source, { stateExpression: "ctx.state" });

describe("shared template expression IR", () => {
  it("classifies plain event handler references from the TypeScript AST", () => {
    expect(analyze("handler").simpleReference).toBe(true);
    expect(analyze("actions.save").simpleReference).toBe(true);
    expect(analyze("actions?.save").simpleReference).toBe(false);
    expect(analyze("save() ").simpleReference).toBe(false);
  });

  it("classifies only direct state assignment paths", () => {
    expect(analyze("count").statePath).toEqual({ root: "count" });
    expect(analyze("record.value").statePath).toEqual({ root: "record", property: "value" });
    expect(analyze("record.deep.value").statePath).toBeNull();
    expect(analyze("record[key]").statePath).toBeNull();
  });

  it("keeps value access transforms and helper requirements in the same IR", () => {
    const expression = analyze("count.value + record.value");

    expect(expression.code).toContain('readTemplateValue(ctx.state, "count", count, false)');
    expect(expression.code).toContain('readTemplateValue(ctx.state, "record", record, false)');
    expect(expression.helpers).toEqual(new Set(["readTemplateValue"]));
    expect(expression.referencedRoots).toEqual(new Set(["count", "record"]));
  });

  it("collects referenced roots without treating property names as state bindings", () => {
    expect(analyze("user.profile?.name ?? fallback").referencedRoots).toEqual(
      new Set(["user", "fallback"])
    );
    expect(analyze("Math.max(count, 0)").referencedRoots).toEqual(new Set(["Math", "count"]));
  });

  it("returns a conservative IR for empty or invalid expressions", () => {
    expect(analyze("")).toMatchObject({ empty: true, simpleReference: false, statePath: null });
    expect(analyze("foo.")).toMatchObject({
      code: "foo.",
      empty: false,
      simpleReference: false,
      statePath: null
    });
  });
});
