// Black-Scholes pricing and greeks. Ported from greeks.py.

// Abramowitz & Stegun 7.1.26 approximation for erf.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number; // per year
  vega: number;
}

function isValid(S: number, K: number, sigma: number, T: number): boolean {
  return sigma > 0 && T > 0 && S > 0 && K > 0 && Number.isFinite(sigma) && Number.isFinite(T);
}

export function putDelta(
  S: number,
  K: number,
  r: number,
  sigma: number,
  TYears: number,
): number {
  if (!isValid(S, K, sigma, TYears)) return NaN;
  const d = d1(S, K, r, sigma, TYears);
  // Raw put delta is N(d1) - 1, in [-1, 0]. Return absolute value (trader convention).
  return Math.abs(normCdf(d) - 1);
}

export function callDelta(
  S: number,
  K: number,
  r: number,
  sigma: number,
  TYears: number,
): number {
  if (!isValid(S, K, sigma, TYears)) return NaN;
  const d = d1(S, K, r, sigma, TYears);
  return normCdf(d);
}

export function putGreeks(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number,
): Greeks {
  if (!isValid(S, K, sigma, T)) {
    return { delta: NaN, gamma: NaN, theta: NaN, vega: NaN };
  }
  const dd1 = d1(S, K, r, sigma, T);
  const dd2 = dd1 - sigma * Math.sqrt(T);
  const nd1 = normCdf(dd1);
  const nd2 = normCdf(dd2);
  const pdfd1 = normPdf(dd1);
  const delta = nd1 - 1; // negative for puts
  const gamma = pdfd1 / (S * sigma * Math.sqrt(T));
  const theta =
    (-(S * pdfd1 * sigma) / (2 * Math.sqrt(T)) +
      r * K * Math.exp(-r * T) * (1 - nd2)) /
    365; // per day
  const vega = (S * pdfd1 * Math.sqrt(T)) / 100; // per 1 vol point
  return { delta, gamma, theta, vega };
}

export function callGreeks(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number,
): Greeks {
  if (!isValid(S, K, sigma, T)) {
    return { delta: NaN, gamma: NaN, theta: NaN, vega: NaN };
  }
  const dd1 = d1(S, K, r, sigma, T);
  const dd2 = dd1 - sigma * Math.sqrt(T);
  const nd1 = normCdf(dd1);
  const nd2 = normCdf(dd2);
  const pdfd1 = normPdf(dd1);
  const delta = nd1;
  const gamma = pdfd1 / (S * sigma * Math.sqrt(T));
  const theta =
    (-(S * pdfd1 * sigma) / (2 * Math.sqrt(T)) -
      r * K * Math.exp(-r * T) * nd2) /
    365;
  const vega = (S * pdfd1 * Math.sqrt(T)) / 100;
  return { delta, gamma, theta, vega };
}
