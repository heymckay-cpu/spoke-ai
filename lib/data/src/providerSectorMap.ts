import type { Sector } from "./sectors";

// Maps the free-form sector strings returned by upstream market data
// providers (Yahoo Finance via `quoteSummary.assetProfile.sector`,
// Polygon reference data via `sic_description` / `sic_code`) into the
// fixed GICS-flavored `Sector` union the dashboard renders. Anything
// unrecognized returns `null` so callers can fall back to the static
// table in `sectors.ts`.

const YAHOO_TO_SECTOR: Readonly<Record<string, Sector>> = {
  Technology: "Information Technology",
  "Information Technology": "Information Technology",
  Healthcare: "Health Care",
  "Health Care": "Health Care",
  "Financial Services": "Financials",
  Financial: "Financials",
  Financials: "Financials",
  "Communication Services": "Communication Services",
  Communications: "Communication Services",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Discretionary": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Consumer Staples": "Consumer Staples",
  Energy: "Energy",
  Industrials: "Industrials",
  "Basic Materials": "Materials",
  Materials: "Materials",
  "Real Estate": "Real Estate",
  Utilities: "Utilities",
};

export function normalizeProviderSector(raw: string | null | undefined): Sector | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return YAHOO_TO_SECTOR[trimmed] ?? null;
}

// Coarse SIC-code → GICS sector mapping for Polygon's reference endpoint,
// which returns `sic_code` (4-digit string) but no GICS-style label.
// Ranges follow the SEC SIC manual; only the bands needed to classify
// liquid US options-active companies are filled in. Returns null for any
// code outside the table so callers fall back to the static map.
export function sectorFromSicCode(rawCode: string | number | null | undefined): Sector | null {
  if (rawCode == null) return null;
  const code = typeof rawCode === "number" ? rawCode : Number.parseInt(String(rawCode), 10);
  if (!Number.isFinite(code) || code < 100 || code > 9999) return null;

  // Health Care: pharmaceutical preparations and medical instruments are
  // scattered across the otherwise-Materials chemicals band, so handle them
  // first to take precedence over the broader range below.
  if (code >= 2830 && code <= 2836) return "Health Care";
  if (code >= 3826 && code <= 3845) return "Health Care";
  if (code >= 8000 && code <= 8099) return "Health Care";

  if (code >= 100 && code <= 999) return "Materials"; // agriculture
  if (code >= 1000 && code <= 1499) return "Materials"; // metal & mineral mining
  if (code >= 1500 && code <= 1799) return "Industrials"; // construction
  if (code >= 2000 && code <= 2199) return "Consumer Staples"; // food, tobacco
  if (code >= 2200 && code <= 2399) return "Consumer Discretionary"; // apparel
  if (code >= 2400 && code <= 2499) return "Industrials"; // lumber
  if (code >= 2500 && code <= 2599) return "Consumer Discretionary"; // furniture
  if (code >= 2600 && code <= 2699) return "Materials"; // paper
  if (code >= 2700 && code <= 2799) return "Communication Services"; // publishing
  if (code >= 2800 && code <= 2899) return "Materials"; // chemicals
  if (code >= 2900 && code <= 2999) return "Energy"; // petroleum refining
  if (code >= 3000 && code <= 3499) return "Materials"; // rubber, glass, metals
  if (code >= 3500 && code <= 3599) return "Industrials"; // machinery
  if (code >= 3600 && code <= 3699) return "Information Technology"; // electronics
  if (code === 3711 || code === 3713 || code === 3714 || code === 3715 || code === 3716)
    return "Consumer Discretionary"; // motor vehicles
  if (code >= 3720 && code <= 3799) return "Industrials"; // aerospace, ships, rail
  if (code >= 3800 && code <= 3899) return "Information Technology"; // instruments
  if (code >= 3900 && code <= 3999) return "Consumer Discretionary"; // misc
  if (code >= 4000 && code <= 4799) return "Industrials"; // transportation services
  if (code >= 4800 && code <= 4899) return "Communication Services"; // telecom
  if (code >= 4900 && code <= 4999) return "Utilities"; // electric, gas, water
  if (code >= 5000 && code <= 5199) return "Consumer Discretionary"; // wholesale
  if (code >= 5200 && code <= 5999) return "Consumer Discretionary"; // retail
  if (code >= 6000 && code <= 6199) return "Financials"; // banks
  if (code >= 6200 && code <= 6299) return "Financials"; // securities
  if (code >= 6300 && code <= 6499) return "Financials"; // insurance
  if (code >= 6500 && code <= 6599) return "Real Estate";
  if (code >= 6700 && code <= 6799) return "Financials"; // holding
  if (code >= 7000 && code <= 7099) return "Consumer Discretionary"; // hotels
  if (code >= 7370 && code <= 7379) return "Information Technology"; // computer svc
  if (code >= 7800 && code <= 7999) return "Communication Services"; // entertainment
  if (code >= 8200 && code <= 8299) return "Consumer Discretionary"; // education

  return null;
}
