// Placeholder assets used until the client supplies real photographs. Every file is visibly
// labelled "PLACEHOLDER · صورة مؤقتة". Real images are uploaded in /admin and override these.
import type { ServiceCategory } from "@/types/models";

export const placeholders = {
  hero: "/placeholders/hero.svg",
  category: { brows: "/placeholders/brows.svg", piercing: "/placeholders/piercing.svg" } satisfies Record<ServiceCategory, string>,
  service: { brows: "/placeholders/service-brows.svg", piercing: "/placeholders/service-piercing.svg" } satisfies Record<
    ServiceCategory,
    string
  >,
  portfolio: [1, 2, 3, 4, 5, 6].map((n) => `/placeholders/portfolio-${n}.svg`),
};

export const LOGO_SRC = "/brand/doniana-logo.jpg";
