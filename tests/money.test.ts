import { describe, expect, it } from "vitest";
import { formatRand, parseRand } from "@/lib/money";

describe("pay rates", () => {
  it("shows rand the South African way", () => {
    expect(formatRand(3299)).toBe("R 32,99");
    expect(formatRand(125050)).toBe("R 1 250,50");
  });

  it("reads rates typed any way", () => {
    expect(parseRand("32,99")).toBe(3299);
    expect(parseRand("R32.99")).toBe(3299);
    expect(parseRand("R 1 250,50")).toBe(125050);
    expect(parseRand("R32")).toBe(3200);
    expect(parseRand("abc")).toBeNull();
    expect(parseRand("0")).toBeNull();
  });

  it("refuses a rate that must be a typing mistake", () => {
    expect(parseRand("10000")).toBe(1_000_000);
    expect(parseRand("10001")).toBeNull();
  });
});
