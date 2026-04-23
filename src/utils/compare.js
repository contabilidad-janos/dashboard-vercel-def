import { format, parseISO, differenceInCalendarDays, subDays, subYears, addDays } from 'date-fns';

/** % change A vs B. Returns null when B is 0 (undefined delta). */
export const pctDelta = (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return ((a - b) / b) * 100;
};

/** Round-trip through YYYY-MM-DD strings so callers don't have to juggle Date objects. */
const iso = (d) => format(d, 'yyyy-MM-dd');

/**
 * Period B = same length, ending the day before Period A starts.
 * A = 2026-04-13..2026-04-19 (7 days) → B = 2026-04-06..2026-04-12
 */
export const presetPreviousPeriod = (startA, endA) => {
    const s = parseISO(startA);
    const e = parseISO(endA);
    const len = differenceInCalendarDays(e, s) + 1;
    const newEnd = subDays(s, 1);
    const newStart = subDays(newEnd, len - 1);
    return [iso(newStart), iso(newEnd)];
};

/** Period B = same calendar range, one year earlier. */
export const presetPreviousYear = (startA, endA) => {
    const s = subYears(parseISO(startA), 1);
    const e = subYears(parseISO(endA), 1);
    return [iso(s), iso(e)];
};

/**
 * Pair a YYYY-MM-DD date in A with the corresponding date in B (for
 * day-by-day overlays). Currently only used by callers that want a lookup
 * table; B is aligned by offset-from-start (day 0 of A maps to day 0 of B).
 */
export const alignDateAtoB = (dateA, startA, startB) => {
    const offset = differenceInCalendarDays(parseISO(dateA), parseISO(startA));
    return iso(addDays(parseISO(startB), offset));
};
