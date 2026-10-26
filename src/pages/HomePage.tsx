import { Link } from "react-router-dom";
import { ArrowLeft, AtSign, CalendarDays, Clock, Gem, Heart, Leaf, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCard } from "@/features/services/CategoryCard";
import { fetchBusinessInfo, fetchCatalog, fetchPortfolio } from "@/features/services/publicData";
import { useAsync } from "@/hooks/useAsync";
import { messages, t } from "@/i18n";
import { cn } from "@/lib/utils";
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
      {/* Hero: copy and type from the client's poster, layout and colours from the web mock-up */}
      <section className="relative isolate overflow-hidden bg-cream">
        {/* Phones: photo on top fading into the text. Desktop: photo on the end side behind a soft fade. */}
        <div className="relative h-72 sm:h-96 md:absolute md:inset-y-0 md:end-0 md:-z-10 md:h-full md:w-[62%]">
          <img
            src={placeholders.hero}
            alt={t("home.placeholderNotice")}
            width={1600}
            height={1000}
            {...{ fetchpriority: "high" }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cream via-cream/10 to-transparent md:hidden" />
        </div>
        <div className="absolute inset-0 -z-10 hidden bg-gradient-to-l from-cream from-35% via-cream/80 to-transparent md:block" />
        <div className="container relative -mt-4 flex flex-col pb-10 md:mt-0 md:min-h-[38rem] md:justify-center md:py-20">
          <div className="max-w-xl text-center md:text-start">
            <p className="font-display text-xs uppercase tracking-brand text-ink/60" lang="en">
              {t("home.heroEyebrow")}
            </p>
            <h1 className="mt-4 text-balance font-heading text-5xl leading-[1.35] text-ink sm:text-6xl">{t("home.heroTitle")}</h1>
            <div className="my-5 flex items-center justify-center gap-3 text-champagne-deep md:justify-start" aria-hidden>
              <span className="h-px w-16 bg-gradient-to-l from-champagne to-transparent" />
              <span className="text-sm">✦</span>
              <span className="h-px w-16 bg-gradient-to-r from-champagne to-transparent" />
            </div>
            <p className="mx-auto max-w-md text-balance text-lg leading-relaxed text-ink/75 md:mx-0">{t("home.heroText")}</p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:items-start">
              <Button asChild size="lg" className="w-full px-7 shadow-md sm:w-auto" data-testid="hero-book">
                <Link to="/book">
                  <CalendarDays aria-hidden />
                  {t("home.bookNow")}
                  <ArrowLeft aria-hidden />
                </Link>
              </Button>
              {settings?.whatsapp_phone && (
                <Button asChild variant="outline" size="lg" className="w-full border-ink/20 bg-cream/60 sm:w-auto">
                  <a href={whatsappLink(settings.whatsapp_phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden /> {t("home.whatsapp")}
                  </a>
                </Button>
              )}
            </div>
            <p className="mt-4 font-display text-[0.7rem] uppercase tracking-[0.3em] text-ink/50" lang="en">
              {t("brand.tagline")}
            </p>
            <ul className="mt-8 grid grid-cols-3 gap-2 text-center text-sm text-ink/80 md:max-w-md">
              {[
                { icon: Leaf, label: t("home.features.natural") },
                { icon: Gem, label: t("home.features.hygiene") },
                { icon: Heart, label: t("home.features.care") },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex flex-col items-center gap-1.5">
                  <Icon className="size-6 text-sage" strokeWidth={1.4} aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="services" className="scroll-mt-24 py-12 sm:py-16">
        <div className="container">
          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryCard category="brows" to="/book/brows" fromPriceAgorot={minPrice(catalog.data, "brows")} />
            <CategoryCard category="piercing" to="/book/piercing" fromPriceAgorot={minPrice(catalog.data, "piercing")} />
          </div>

          {/* Booking in four steps */}
          <div className="mt-14 text-center">
            <h2 className="font-heading text-4xl text-ink">{t("home.easyTitle")}</h2>
            <p className="mt-1 text-muted-foreground">{t("home.easyText")}</p>
            <ol className="mx-auto mt-6 flex max-w-xl items-start">
              {messages.booking.steps.map((label, i) => (
                <li key={label} className="flex flex-1 items-start">
                  <span className="flex flex-1 flex-col items-center gap-2">
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-full border text-sm font-semibold",
                        i === 0 ? "border-rose-deep/40 bg-rose text-ink" : "border-ink/20 bg-card text-ink/70",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-ink/80">{label}</span>
                  </span>
                  {i < messages.booking.steps.length - 1 && <span aria-hidden className="mt-5 h-px flex-1 bg-ink/15" />}
                </li>
              ))}
            </ol>
          </div>

          <div className="mx-auto mt-14 max-w-xl text-center">
            <h2 className="font-heading text-4xl text-ink">{t("home.servicesTitle")}</h2>
            <p className="mt-2 text-muted-foreground">{t("home.servicesText")}</p>
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
      <section id="gallery" className="scroll-mt-20 bg-rose-light/60 py-16 sm:py-24">
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <p className="eyebrow-label">Portfolio</p>
            <h2 className="mt-2 font-heading text-4xl">{t("home.galleryTitle")}</h2>
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
            <h2 className="mt-2 font-heading text-4xl">{t("home.contactTitle")}</h2>
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

      <section className="bg-sage py-14 text-center text-cream">
        <div className="container flex flex-col items-center gap-5">
          <div className="hairline" />
          <p className="font-heading text-4xl sm:text-5xl">{t("home.heroTitle")}</p>
          <Button asChild size="lg" className="bg-cream text-sage hover:bg-cream/90">
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
