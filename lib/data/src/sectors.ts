// Static ticker → GICS sector map for popular wheel-strategy underlyings.
// This is intentionally a hand-maintained, dependency-free table. Unknown
// tickers fall back to "Unclassified" and skip sector concentration checks.
//
// Coverage focuses on liquid, options-active large caps that show up most
// often on a wheel screener (mega-cap tech, banks, energy, healthcare,
// consumer brands, popular ETFs).

export const UNCLASSIFIED_SECTOR = "Unclassified" as const;

export type Sector =
  | "Information Technology"
  | "Communication Services"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Energy"
  | "Financials"
  | "Health Care"
  | "Industrials"
  | "Materials"
  | "Real Estate"
  | "Utilities"
  | "ETF / Index"
  | typeof UNCLASSIFIED_SECTOR;

export const TICKER_SECTORS: Readonly<Record<string, Sector>> = {
  // --- Information Technology ---
  AAPL: "Information Technology",
  MSFT: "Information Technology",
  NVDA: "Information Technology",
  AMD: "Information Technology",
  INTC: "Information Technology",
  AVGO: "Information Technology",
  ORCL: "Information Technology",
  CRM: "Information Technology",
  ADBE: "Information Technology",
  CSCO: "Information Technology",
  IBM: "Information Technology",
  QCOM: "Information Technology",
  TXN: "Information Technology",
  MU: "Information Technology",
  AMAT: "Information Technology",
  PLTR: "Information Technology",
  SHOP: "Information Technology",
  SNOW: "Information Technology",
  NOW: "Information Technology",
  PANW: "Information Technology",
  SMCI: "Information Technology",
  ARM: "Information Technology",

  // --- Communication Services ---
  GOOGL: "Communication Services",
  GOOG: "Communication Services",
  META: "Communication Services",
  NFLX: "Communication Services",
  DIS: "Communication Services",
  T: "Communication Services",
  VZ: "Communication Services",
  TMUS: "Communication Services",
  CMCSA: "Communication Services",
  SNAP: "Communication Services",
  RBLX: "Communication Services",

  // --- Consumer Discretionary ---
  AMZN: "Consumer Discretionary",
  TSLA: "Consumer Discretionary",
  HD: "Consumer Discretionary",
  MCD: "Consumer Discretionary",
  NKE: "Consumer Discretionary",
  SBUX: "Consumer Discretionary",
  LOW: "Consumer Discretionary",
  TGT: "Consumer Discretionary",
  BKNG: "Consumer Discretionary",
  ABNB: "Consumer Discretionary",
  F: "Consumer Discretionary",
  GM: "Consumer Discretionary",
  RIVN: "Consumer Discretionary",
  LCID: "Consumer Discretionary",
  ETSY: "Consumer Discretionary",

  // --- Consumer Staples ---
  WMT: "Consumer Staples",
  COST: "Consumer Staples",
  PG: "Consumer Staples",
  KO: "Consumer Staples",
  PEP: "Consumer Staples",
  PM: "Consumer Staples",
  MO: "Consumer Staples",
  CL: "Consumer Staples",

  // --- Energy ---
  XOM: "Energy",
  CVX: "Energy",
  COP: "Energy",
  SLB: "Energy",
  OXY: "Energy",
  EOG: "Energy",
  PSX: "Energy",
  MPC: "Energy",

  // --- Financials ---
  JPM: "Financials",
  BAC: "Financials",
  WFC: "Financials",
  C: "Financials",
  GS: "Financials",
  MS: "Financials",
  SCHW: "Financials",
  AXP: "Financials",
  BLK: "Financials",
  V: "Financials",
  MA: "Financials",
  PYPL: "Financials",
  COIN: "Financials",
  SOFI: "Financials",
  HOOD: "Financials",
  BRK_B: "Financials",

  // --- Health Care ---
  JNJ: "Health Care",
  PFE: "Health Care",
  MRK: "Health Care",
  ABBV: "Health Care",
  LLY: "Health Care",
  UNH: "Health Care",
  CVS: "Health Care",
  TMO: "Health Care",
  MDT: "Health Care",
  DHR: "Health Care",
  GILD: "Health Care",
  MRNA: "Health Care",

  // --- Industrials ---
  BA: "Industrials",
  CAT: "Industrials",
  DE: "Industrials",
  GE: "Industrials",
  HON: "Industrials",
  UPS: "Industrials",
  FDX: "Industrials",
  LMT: "Industrials",
  RTX: "Industrials",
  UBER: "Industrials",

  // --- Materials ---
  LIN: "Materials",
  FCX: "Materials",
  NEM: "Materials",

  // --- Real Estate ---
  PLD: "Real Estate",
  AMT: "Real Estate",
  SPG: "Real Estate",
  O: "Real Estate",

  // --- Utilities ---
  NEE: "Utilities",
  DUK: "Utilities",
  SO: "Utilities",

  // --- ETFs / Index proxies (treated as their own bucket) ---
  SPY: "ETF / Index",
  QQQ: "ETF / Index",
  IWM: "ETF / Index",
  DIA: "ETF / Index",
  VTI: "ETF / Index",
  VOO: "ETF / Index",
  XLF: "ETF / Index",
  XLE: "ETF / Index",
  XLK: "ETF / Index",
  XLV: "ETF / Index",
  GLD: "ETF / Index",
  SLV: "ETF / Index",
  TLT: "ETF / Index",
  HYG: "ETF / Index",
  ARKK: "ETF / Index",
};

export function sectorForTicker(ticker: string): Sector {
  if (!ticker) return UNCLASSIFIED_SECTOR;
  const normalized = ticker.trim().toUpperCase().replace(/[.\-]/g, "_");
  return TICKER_SECTORS[normalized] ?? UNCLASSIFIED_SECTOR;
}

export function isClassified(ticker: string): boolean {
  return sectorForTicker(ticker) !== UNCLASSIFIED_SECTOR;
}
