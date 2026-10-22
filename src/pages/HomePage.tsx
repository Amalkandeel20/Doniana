import { Link } from "react-router-dom";
import { AtSign, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { CategoryCard } from "@/features/services/CategoryCard";
import { fetchBusinessInfo, fetchCatalog, fetchPortfolio } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { t } from "@/i18n";
import { ARABIC_WEEKDAYS, formatDurationAr, formatPhoneForDisplay, formatShekels, whatsappLink } from "@/lib/format";
import { placeholders } from "@/lib/placeholders";
import { publicImageUrl } from "@/lib/supabase";
import type { Service, ServiceCategory } from "@/types/models";

function minPrice(services: Service[] | undefined, category: ServiceCategory) {
  const prices = services?.filter((s) => s.category === category).map((s) => s.price_agorot) ?? [];
  return prices.length ? Math.min(...prices) : undefined;
}

export default function HomePage() {
  const catalog = useAsync(() => fetchCatalog(), []);
  const info = useAsync(() => fetchBusinessInfo(), []);
  const portfolio = useAsync(() => fetchPortfolio(), []);
  const settings = info.data?.settings;
  const hours = info.data?.hours ?? [];
  const hasHours = hours.some((h) => h.is_open);
  const gallery = portfolio.data?.length
    ? portfolio.data.map((p) => ({ src: publicImageUrl("portfolio", p.storage_path)!, alt: p.alt_ar, placeholder: false }))
    : placeholders.portfolio.map((src) => ({ src, alt: t("home.placeholderNotice"), placeholder: true }));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-black text-ivory">
        <div className="container grid items-center gap-10 pb-14 pt-8 md:grid-cols-2 md:gap-14 md:pb-24 md:pt-14">
          <div className="flex flex-col items-center text-center md:items-start md:text-start">
            <Logo className="h-44 sm:h-56" priority />
            <h1 className="mt-6 text-balance text-4xl font-light leading-tight sm:text-5xl">{t("home.heroTitle")}</h1>
            <p className="mt-4 max-w-md text-balance text-base leading-relaxed text-ivory/75 sm:text-lg">{t("home.heroText")}</p>
            <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button asChild variant="champagne" size="lg" className="w-full sm:w-auto" data-testid="hero-book">
                <Link to="/book">
                  {t("home.bookNow")}
                  <span className="font-display text-sm tracking-wider opacity-70">· {t("home.bookNowEn")}</span>
                </Link>
              </Button>
              {settings?.whatsapp_phone && (
                <Button asChild variant="light" size="lg" className="w-full sm:w-auto">
                  <a href={whatsappLink(settings.whatsapp_phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden /> {t("home.whatsapp")}
                  </a>
                </Button>
              )}
            </div>
          </div>
          <figure className="relative mx-auto w-full max-w-md md:max-w-none">
            <img
              src={placeholders.hero}
              alt={t("home.placeholderNotice")}
              width={1200}
              height={1500}
              {...{ fetchpriority: "high" }}
              className="aspect-[4/5] w-full rounded-[2rem] object-cover ring-1 ring-white/10"
            />
            <div className="pointer-events-none absolute -bottom-3 -start-3 h-24 w-24 rounded-full border border-champagne/40" />
          </figure>
        </div>
      </section>

      {/* Categories */}
      <section id="services" className="scroll-mt-20 py-16 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <p className="eyebrow-label">Services</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{t("home.servicesTitle")}</h2>
            <p className="mt-3 text-muted-foreground">{t("home.servicesText")}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <CategoryCard category="brows" to="/book/brows" fromPriceAgorot={minPrice(catalog.data, "brows")} />
            <CategoryCard category="piercing" to="/book/piercing" fromPriceAgorot={minPrice(catalog.data, "piercing")} />
          </div>

          {catalog.data && catalog.data.length > 0 && (
            <div className="mt-12 grid gap-8 md:grid-cols-2">
              {(["brows", "piercing"] as const).map((cat) => (
                <div key={cat}>
                  <h3 className="mb-3 text-lg font-semibold">{t(`categories.${cat}.ar`)}</h3>
                  <ul className="divide-y rounded-3xl border bg-card">
                    {catalog.data!
                      .filter((s) => s.category === cat)
                      .map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="min-w-0">
                            <p className="font-medium">{s.name_ar}</p>
                            <p className="ltr font-display text-sm text-muted-foreground" lang="en">
                              {s.name_en}
                            </p>
                          </div>
                          <div className="shrink-0 text-end">
                            <p className="font-semibold">{formatShekels(s.price_agorot)}</p>
                            <p className="text-xs text-muted-foreground">{formatDurationAr(s.duration_minutes)}</p>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="scroll-mt-20 bg-cream/60 py-16 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <p className="eyebrow-label">Portfolio</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{t("home.galleryTitle")}</h2>
          </div>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {gallery.map((img, i) => (
              <li key={img.src + i} className="overflow-hidden rounded-2xl bg-ink/5">
                <img src={img.src} alt={img.alt} loading="lazy" width={900} height={1125} className="aspect-[4/5] w-full object-cover" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 py-16 sm:py-24">
        <div className="container grid gap-10 md:grid-cols-2">
          <div>
            <p className="eyebrow-label">Contact</p>
            <h2 className="mt-2 text-3xl font-semibold">{t("home.contactTitle")}</h2>
            <ul className="mt-6 space-y-3">
              {settings?.whatsapp_phone && (
                <ContactRow icon={<MessageCircle />} href={whatsappLink(settings.whatsapp_phone)} label={t("home.whatsapp")} value={formatPhoneForDisplay(settings.whatsapp_phone)} />
              )}
              {settings?.contact_phone && (
                <ContactRow icon={<Phone />} href={`tel:${settings.contact_phone}`} label={t("home.call")} value={formatPhoneForDisplay(settings.contact_phone)} />
              )}
              {settings?.instagram_url && (
                <ContactRow icon={<AtSign />} href={settings.instagram_url} label={t("home.instagram")} value={settings.instagram_url.replace(/^https:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")} />
              )}
              {settings?.address_ar && (
                <ContactRow icon={<MapPin />} href={settings.maps_url ?? undefined} label={t("home.location")} value={settings.address_ar} />
              )}
              {!settings?.whatsapp_phone && !settings?.contact_phone && !settings?.instagram_url && !settings?.address_ar && (
                <li className="text-muted-foreground">{t("home.contactPending")}</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="size-5 text-champagne-deep" aria-hidden /> {t("home.hoursTitle")}
            </h3>
            {hasHours ? (
              <dl className="mt-4 divide-y rounded-3xl border bg-card">
                {hours.map((h) => (
                  <div key={h.weekday} className="flex justify-between px-5 py-3 text-sm">
                    <dt>{ARABIC_WEEKDAYS[h.weekday]}</dt>
                    <dd className="ltr text-muted-foreground">
                      {h.is_open ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}` : t("home.closed")}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-muted-foreground">{t("home.hoursPending")}</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-black py-14 text-center text-ivory">
        <div className="container flex flex-col items-center gap-5">
          <div className="hairline" />
          <p className="text-2xl font-light sm:text-3xl">{t("home.heroTitle")}</p>
          <Button asChild variant="champagne" size="lg">
            <Link to="/book">{t("home.bookNow")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function ContactRow({ icon, href, label, value }: { icon: React.ReactNode; href?: string; label: string; value: string }) {
  const content = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-cream text-ink [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate font-medium">{value}</span>
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl p-2 hover:bg-secondary">
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-3 p-2">{content}</div>
      )}
    </li>
  );
}
