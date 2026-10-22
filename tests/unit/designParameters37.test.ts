import { afterEach, describe, expect, it } from "vitest";
import { formulaUsesParameter, normalizeDesignParameters, parameterNameProblem, renameInFormula, setActiveParameters } from "@/lib/designParameters";
import { evaluateArithmetic, isArithmeticInput, parseMeasurementInput } from "@/lib/measurementUnits";
import { formulaToRemember } from "@/lib/fieldFormulas";

afterEach(() => setActiveParameters([]));

describe("design parameters (build 37)", () => {
  it("lets fields use parameters, alone and in sums", () => {
    setActiveParameters([{ name: "wall", value: 2 }, { name: "box_width", value: 60 }]);
    expect(parseMeasurementInput("wall")).toBe(2);
    expect(parseMeasurementInput("box_width - 2 * wall")).toBe(56);
    expect(parseMeasurementInput("(box_width + wall) / 2")).toBe(31);
    expect(isArithmeticInput("wall")).toBe(true);
    expect(formulaToRemember("box_width/2")).toBe("box_width/2");
    // An unknown name is no number.
    expect(Number.isNaN(parseMeasurementInput("lid"))).toBe(true);
  });

  it("still reads x as times between numbers, and plain numbers as before", () => {
    setActiveParameters([{ name: "box", value: 5 }]);
    expect(evaluateArithmetic("2x3")).toBe(6);
    expect(evaluateArithmetic("2 × 3")).toBe(6);
    expect(evaluateArithmetic("box*2")).toBe(10);
    expect(parseMeasurementInput("12,5")).toBe(12.5);
    expect(parseMeasurementInput("-4")).toBe(-4);
    expect(isArithmeticInput("12")).toBe(false);
  });

  it("finds and renames a parameter in formulas without touching longer names", () => {
    expect(formulaUsesParameter("wall*2", "wall")).toBe(true);
    expect(formulaUsesParameter("wall_inner*2", "wall")).toBe(false);
    expect(renameInFormula("wall + wall_inner - wall", "wall", "side")).toBe("side + wall_inner - side");
  });

  it("checks names and cleans saved lists", () => {
    expect(parameterNameProblem("2wall", [])).toBe("invalid");
    expect(parameterNameProblem("x", [])).toBe("reserved");
    expect(parameterNameProblem("wall", [{ name: "wall", value: 1 }])).toBe("taken");
    expect(parameterNameProblem("wall", [])).toBeNull();
    expect(normalizeDesignParameters([{ name: "wall", value: 2 }, { name: "wall", value: 3 }, { name: "bad name", value: 1 }, { name: "n", value: "4" }])).toEqual([{ name: "wall", value: 2 }]);
    expect(normalizeDesignParameters([])).toBeUndefined();
  });
});
