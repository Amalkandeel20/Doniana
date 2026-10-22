// Money is always integer agorot (1 ₪ = 100 agorot) to avoid floating-point drift.

export interface PricedService {
  priceAgorot: number;
  durationMinutes: number;
}

export interface PricedAddon {
  priceAgorot: number;
  extraDurationMinutes: number;
}

export interface PricedLocation {
  priceDeltaAgorot: number;
  durationDeltaMinutes: number;
}

export interface Quote {
  totalPriceAgorot: number;
  durationMinutes: number;
}

export function quote(
  service: PricedService,
  addons: readonly PricedAddon[] = [],
  location: PricedLocation | null = null,
): Quote {
  let totalPriceAgorot = service.priceAgorot;
  let durationMinutes = service.durationMinutes;
  for (const addon of addons) {
    totalPriceAgorot += addon.priceAgorot;
    durationMinutes += addon.extraDurationMinutes;
  }
  if (location) {
    totalPriceAgorot += location.priceDeltaAgorot;
    durationMinutes += location.durationDeltaMinutes;
  }
  if (totalPriceAgorot < 0) throw new Error("Total price cannot be negative");
  if (durationMinutes <= 0) throw new Error("Duration must be positive");
  return { totalPriceAgorot, durationMinutes };
}

export const shekelsToAgorot = (shekels: number) => Math.round(shekels * 100);

export function formatShekels(agorot: number): string {
  const shekels = agorot / 100;
  const amount = Number.isInteger(shekels) ? String(shekels) : shekels.toFixed(2);
  // U+20AA NEW SHEQEL SIGN; the LRM isolate keeps "₪70" readable inside Arabic text.
  return `⁦₪${amount}⁩`;
}
