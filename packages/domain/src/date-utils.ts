/**
 * DateString helpers (Fixes #48).
 *
 * `DateString` is typed as `${number}-${number}-${number}`, so non-zero-padded
 * values like "2024-1-15" are legal. Tax/fee rule selection compares these
 * strings lexicographically ("2024-1-15" < "2024-1-9"), which silently picks
 * the wrong rate. Normalize to zero-padded form before comparing so padded
 * and non-padded inputs behave identically.
 */
export function toComparableDate(dateString: string): string {
  const parts = String(dateString ?? "").split("-");

  if (parts.length !== 3) {
    return String(dateString ?? "");
  }

  const [year, month, day] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function isDateOnOrAfter(candidate: string, boundary: string): boolean {
  return toComparableDate(candidate) >= toComparableDate(boundary);
}

export function compareDatesDesc(left: string, right: string): number {
  return toComparableDate(right).localeCompare(toComparableDate(left));
}
