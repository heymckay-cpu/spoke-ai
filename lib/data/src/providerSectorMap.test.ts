import { describe, expect, it } from "vitest";
import { normalizeProviderSector, sectorFromSicCode } from "./providerSectorMap";

describe("normalizeProviderSector", () => {
  it("maps Yahoo's free-form sector strings to GICS sectors", () => {
    expect(normalizeProviderSector("Technology")).toBe("Information Technology");
    expect(normalizeProviderSector("Healthcare")).toBe("Health Care");
    expect(normalizeProviderSector("Financial Services")).toBe("Financials");
    expect(normalizeProviderSector("Consumer Cyclical")).toBe("Consumer Discretionary");
    expect(normalizeProviderSector("Consumer Defensive")).toBe("Consumer Staples");
    expect(normalizeProviderSector("Basic Materials")).toBe("Materials");
    expect(normalizeProviderSector("Real Estate")).toBe("Real Estate");
    expect(normalizeProviderSector("Utilities")).toBe("Utilities");
  });

  it("trims and returns null for empty / unknown input", () => {
    expect(normalizeProviderSector("  Technology  ")).toBe("Information Technology");
    expect(normalizeProviderSector(null)).toBeNull();
    expect(normalizeProviderSector(undefined)).toBeNull();
    expect(normalizeProviderSector("")).toBeNull();
    expect(normalizeProviderSector("Quantum Spaghetti")).toBeNull();
  });
});

describe("sectorFromSicCode", () => {
  it("classifies common SIC bands", () => {
    expect(sectorFromSicCode(2834)).toBe("Health Care"); // pharma preparations
    expect(sectorFromSicCode("3674")).toBe("Information Technology"); // semiconductors
    expect(sectorFromSicCode(6021)).toBe("Financials"); // commercial banks
    expect(sectorFromSicCode(4911)).toBe("Utilities"); // electric services
    expect(sectorFromSicCode(2911)).toBe("Energy"); // petroleum refining
    expect(sectorFromSicCode(3711)).toBe("Consumer Discretionary"); // motor vehicles
    expect(sectorFromSicCode(6500)).toBe("Real Estate");
  });

  it("returns null for unknown / invalid codes", () => {
    expect(sectorFromSicCode(null)).toBeNull();
    expect(sectorFromSicCode(undefined)).toBeNull();
    expect(sectorFromSicCode("nope")).toBeNull();
    expect(sectorFromSicCode(99)).toBeNull();
    expect(sectorFromSicCode(99999)).toBeNull();
  });
});
