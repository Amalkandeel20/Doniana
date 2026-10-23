// Israeli mobile numbers: 05X-XXXXXXX locally, +972 5X-XXXXXXX internationally.
// Accepted mobile prefixes. 056/059 belong to Palestinian operators (+970) and are not
// accepted until the business confirms it wants them (see docs/OPEN-QUESTIONS.md).
const ISRAELI_MOBILE_SECOND_DIGITS = new Set(["0", "1", "2", "3", "4", "5", "8"]);

const DIGIT_MAP: Record<string, string> = {};
"\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));
"\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));

export function toLatinDigits(input: string): string {
  return input.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** Returns the E.164 form (+9725XXXXXXXX) or null when the input is not an Israeli mobile. */
export function normalizeIsraeliMobile(input: string): string | null {
  let s = toLatinDigits(input)
    .trim()
    .replace(/[\s\-().\u200e\u200f\u2066-\u2069]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+972")) s = s.slice(4);
  else if (s.startsWith("972") && s.length === 12) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  if (!/^5\d{8}$/.test(s)) return null;
  if (!ISRAELI_MOBILE_SECOND_DIGITS.has(s[1]!)) return null;
  return `+972${s}`;
}

/** +972541234567 \u2192 054-123-4567 (wrapped as an LTR isolate for Arabic text). */
export function formatPhoneForDisplay(e164: string): string {
  const m = /^\+972(5\d)(\d{3})(\d{4})$/.exec(e164);
  const local = m ? `0${m[1]}-${m[2]}-${m[3]}` : e164;
  return `\u2066${local}\u2069`;
}
