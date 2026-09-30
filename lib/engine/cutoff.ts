import type { Claim } from "@/lib/types";

const PAYROLL_CUTOFF: readonly RegExp[] = [
  /submitted in the customer portal by the (\d{1,2})(?:st|nd|rd|th)?/i,
  /deadline for submitting payroll changes:\s*(\d{1,2})(?:st|nd|rd|th)?/i,
  /cut-off for payroll changes is the (\d{1,2})(?:st|nd|rd|th)?/i,
  /payroll-change cut-off is the (\d{1,2})(?:st|nd|rd|th)?/i,
];

/**
 * A quote counts only when it is the payroll-change submission cut-off.
 * Payslip publication days and expense-claim deadlines are different facts.
 */
export function quoteSupportsCutoff(quote: string): boolean {
  return PAYROLL_CUTOFF.some((pattern) => pattern.test(quote));
}

export function claimFromText(sourceId: string, text: string): Claim | null {
  for (const pattern of PAYROLL_CUTOFF) {
    const match = text.match(pattern);
    const day = match?.[1];
    if (!match || !day) continue;
    const value = Number(day);
    if (!Number.isInteger(value) || value < 1 || value > 31) return null;
    return {
      sourceId,
      field: "cutoff_day",
      value: String(value),
      quote: match[0],
    };
  }
  return null;
}

export function cutoffDay(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) {
    const match = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (!match?.[1]) return null;
    const day = Number(match[1]);
    return day >= 1 && day <= 31 ? day : null;
  }
  const day = Number(value);
  return day >= 1 && day <= 31 ? day : null;
}
