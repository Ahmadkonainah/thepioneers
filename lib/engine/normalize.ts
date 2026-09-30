export interface CutoffNorm {
  day: number | null;
  time: string | null;
  raw: string;
}

const FIELD_ALIASES: Record<string, string> = {
  cutoff: "payroll.cutoff",
  "cut-off": "payroll.cutoff",
  cut_off: "payroll.cutoff",
  "payroll.cutoff": "payroll.cutoff",
  "payroll.cut-off": "payroll.cutoff",
};

export function canonicalField(field: string): string {
  const key = field.trim().toLowerCase();
  return FIELD_ALIASES[key] ?? key;
}

function normaliseTime(value: string): string {
  const [hours, minutes] = value.split(":");
  if (!hours || !minutes) return value;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

export function normaliseCutoffValue(value: string): CutoffNorm {
  const raw = value.toLowerCase().replace(/\s+/g, " ").trim();
  const dayMatch = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  const timeMatch = raw.match(/\b(\d{1,2}:\d{2})\b/);
  const dayNumber = dayMatch?.[1] ? Number(dayMatch[1]) : null;
  const day = dayNumber !== null && dayNumber >= 1 && dayNumber <= 31 ? dayNumber : null;
  const time = timeMatch?.[1] ? normaliseTime(timeMatch[1]) : null;
  return { day, time, raw };
}

/** Same calendar day. A missing time does not conflict with a more specific time. */
export function cutoffKeysEqual(a: CutoffNorm, b: CutoffNorm): boolean {
  if (a.day === null || b.day === null) return a.raw === b.raw;
  if (a.day !== b.day) return false;
  if (a.time && b.time && a.time !== b.time) return false;
  return true;
}

export function mostSpecificCutoff(norms: readonly CutoffNorm[]): CutoffNorm | null {
  const first = norms[0];
  if (!first) return null;
  if (!norms.every((norm) => cutoffKeysEqual(first, norm))) return null;
  return norms.find((norm) => norm.time) ?? first;
}
