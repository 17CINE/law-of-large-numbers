import { describe, expect, test } from "vitest";

import {
  absoluteZScore,
  chiSquareCoinToss,
  chiSquareGoodnessOfFit,
  chiSquareSurvival,
  erf,
  expectedAbsoluteDeviation,
  gammaP,
  headsSigma,
  lnGamma,
  normalBinMass,
  normalCdf,
  normalPdf,
  proportion,
  proportionSigma,
  zScore,
} from "./stats";

describe("erf", () => {
  test("erf(0) === 0", () => {
    expect(erf(0)).toBeCloseTo(0, 12);
  });
  test("erf(1) ≈ 0.84270079295", () => {
    expect(erf(1)).toBeCloseTo(0.8427007929497148, 10);
  });
  test("erf(-x) === -erf(x)", () => {
    expect(erf(-1.5)).toBeCloseTo(-erf(1.5), 12);
  });
});

describe("normal cdf/pdf", () => {
  test("normalCdf(0,0,1)=0.5", () => {
    expect(normalCdf(0, 0, 1)).toBeCloseTo(0.5, 12);
  });
  test("normalCdf(1.96,0,1) ~ 0.975", () => {
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 4);
  });
  test("normalPdf peaks at mean", () => {
    expect(normalPdf(5, 5, 2)).toBeGreaterThan(normalPdf(4, 5, 2));
  });
  test("normalBinMass(0.5,1.5,0,1) matches CDF difference", () => {
    const m = normalBinMass(0.5, 1.5, 0, 1);
    expect(m).toBeCloseTo(normalCdf(1.5, 0, 1) - normalCdf(0.5, 0, 1), 12);
  });
});

describe("lnGamma", () => {
  test("lnGamma(0.5) ≈ 0.5723649429247001", () => {
    expect(lnGamma(0.5)).toBeCloseTo(0.5723649429247001, 10);
  });
  test("lnGamma(1)=0, lnGamma(2)=0", () => {
    expect(lnGamma(1)).toBeCloseTo(0, 12);
    expect(lnGamma(2)).toBeCloseTo(0, 12);
  });
});

describe("gammaP & chi-square survival", () => {
  test("P(1,0.5) in (0,1)", () => {
    const p = gammaP(1, 0.5);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
  test("chiSquareSurvival(x,1): large x -> small p", () => {
    expect(chiSquareSurvival(6.635, 1)).toBeCloseTo(0.01, 4);
  });
  test("chiSquareSurvival(x,1): moderate x", () => {
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(0.05, 4);
  });
  test("chiSquareCoinToss fair gives large p, unfair small", () => {
    const fair = chiSquareCoinToss(50, 50);
    expect(fair.pValue).toBeGreaterThan(0.9);
    const unfair = chiSquareCoinToss(100, 0);
    expect(unfair.pValue).toBeLessThan(1e-10);
  });
  test("chiSquareGoodnessOfFit sums correctly, df respected", () => {
    const observed = [10, 0];
    const expected = [5, 5];
    const r = chiSquareGoodnessOfFit(observed, expected, 1);
    expect(r.statistic).toBeCloseTo(10, 6);
    expect(r.degreesOfFreedom).toBe(1);
    expect(r.pValue).toBeLessThan(0.01);
  });
});

describe("convergence helpers", () => {
  test("proportionSigma(4)=0.25", () => {
    expect(proportionSigma(4)).toBeCloseTo(0.25, 12);
  });
  test("headsSigma(4)=1", () => {
    expect(headsSigma(4)).toBeCloseTo(1, 12);
  });
  test("zScore(60,100)=2.0", () => {
    expect(zScore(60, 100)).toBeCloseTo(2.0, 12);
  });
  test("proportion(3,6)=0.5", () => {
    expect(proportion(3, 6)).toBeCloseTo(0.5, 12);
  });
  test("expectedAbsoluteDeviation(4) ≈ 0.797885*1", () => {
    expect(expectedAbsoluteDeviation(4)).toBeCloseTo(0.7978845608028654, 9);
  });
  test("absoluteZScore matches |z|", () => {
    expect(absoluteZScore(40, 100)).toBeCloseTo(2.0, 12);
  });
});
