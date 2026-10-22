import { ar, type Messages } from "./ar";

// Single active locale today (Arabic, RTL). To add a language: create a file with the same shape
// as `ar`, register it here, and set <html lang/dir> from `locales[current].dir`.
export const locales = {
  ar: { messages: ar, dir: "rtl" as const, htmlLang: "ar" },
};
export type Locale = keyof typeof locales;
export const currentLocale: Locale = "ar";

const messages: Messages = locales[currentLocale].messages;

type Path<T, P extends string = ""> = T extends string
  ? P
  : T extends readonly unknown[]
    ? P
    : { [K in keyof T & string]: Path<T[K], P extends "" ? K : `${P}.${K}`> }[keyof T & string];

export type MessageKey = Path<Messages>;

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

export function t(key: MessageKey | (string & {}), vars?: Record<string, string | number>): string {
  const value = lookup(key);
  if (typeof value !== "string") return key;
  return vars ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")) : value;
}

export { messages };
