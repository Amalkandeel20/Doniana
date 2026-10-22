// Public (anon, RLS-filtered) reads: catalog, business info, opening hours, portfolio.
import { supabase } from "@/lib/supabase";
import type { BusinessHours, BusinessSettings, PortfolioImage, Service } from "@/types/models";

let catalogPromise: Promise<Service[]> | null = null;

export function fetchCatalog(force = false): Promise<Service[]> {
  if (!catalogPromise || force) {
    catalogPromise = (async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_addons(*), service_locations(*)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as Service[]).map((s) => ({
        ...s,
        service_addons: [...s.service_addons].filter((a) => a.is_active).sort((a, b) => a.sort_order - b.sort_order),
        service_locations: [...s.service_locations].filter((l) => l.is_active).sort((a, b) => a.sort_order - b.sort_order),
      }));
    })().catch((e) => {
      catalogPromise = null;
      throw e;
    });
  }
  return catalogPromise;
}

export interface BusinessInfo {
  settings: BusinessSettings | null;
  hours: BusinessHours[];
}

let infoPromise: Promise<BusinessInfo> | null = null;

export function fetchBusinessInfo(): Promise<BusinessInfo> {
  if (!infoPromise) {
    infoPromise = (async () => {
      const [settings, hours] = await Promise.all([
        supabase.from("business_settings").select("*").maybeSingle(),
        supabase.from("business_hours").select("*").order("weekday"),
      ]);
      if (settings.error) throw settings.error;
      if (hours.error) throw hours.error;
      return { settings: settings.data as BusinessSettings | null, hours: (hours.data ?? []) as BusinessHours[] };
    })().catch((e) => {
      infoPromise = null;
      throw e;
    });
  }
  return infoPromise;
}

export async function fetchPortfolio(): Promise<PortfolioImage[]> {
  const { data, error } = await supabase.from("portfolio_images").select("*").eq("is_published", true).order("sort_order");
  if (error) throw error;
  return data as PortfolioImage[];
}
