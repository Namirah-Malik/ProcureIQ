// All monetary math happens in integer minor units (paise/cents) to avoid
// floating-point rounding errors. UI-facing formatting lives here too.

export function toMinor(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}

export function toMajor(minorAmount: number): number {
  return minorAmount / 100;
}

export function formatMoney(minorAmount: number, currency = "INR"): string {
  const major = toMajor(minorAmount);
  const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  return formatter.format(major);
}
