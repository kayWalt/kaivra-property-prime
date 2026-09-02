import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Mail, MapPin, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/kaivra/Brand";
import { useSession } from "@/hooks/useAuth";
import { formatCompact } from "@/lib/kaivra";
import heroAsset from "@/assets/kaivra-22-00-40.jpg.asset.json";
import adviserAsset from "@/assets/kaivra-22-00-16.jpg.asset.json";
import residenceAsset from "@/assets/kaivra-22-00-51.jpg.asset.json";
import partnerHutuAsset from "@/assets/partner-hutu-prestige.jpg.asset.json";
import partnerAbibeeAsset from "@/assets/partner-abibee.jpg.asset.json";
import teamChairman from "@/assets/team-chairman.jpg.asset.json";
import teamBenedicta from "@/assets/team-benedicta-elerewe.jpg.asset.json";
import teamCharles from "@/assets/team-charles-agwam.jpg.asset.json";
import teamRichard from "@/assets/team-richard-efem.jpg.asset.json";
import teamJulient from "@/assets/team-julient-aliyu.jpg.asset.json";
import teamWassim from "@/assets/team-wassim-kiwan.jpg.asset.json";
import teamHassan from "@/assets/team-hassan-jaafar.jpg.asset.json";
import teamJoseph from "@/assets/team-joseph-osoria.jpg.asset.json";
import teamNkiruka from "@/assets/team-nkiruka-onyeugo.jpg.asset.json";
import teamYarison from "@/assets/team-yarison-hope.jpg.asset.json";
import { mediaSrc, assetUrl } from "@/lib/media";
import { ContactForm } from "@/components/kaivra/ContactForm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Smart Real Estate Investment Management" },
      {
        name: "description",
        content:
          "Discover premium real-estate projects and manage your investments, subscriptions, payments and documents in one secure platform.",
      },
      { property: "og:title", content: "KAIVRA | Smart Real Estate Investment Management" },
      {
        property: "og:description",
        content: "Invest in the future you can own. Premium real-estate investment management.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kaivraa.com/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // Canonical host is the apex domain; www serves the same app.
    links: [{ rel: "canonical", href: "https://kaivraa.com/" }],
  }),
  component: Landing,
});

function useProjects() {
  return useQuery({
    queryKey: ["public-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, location, description, hero_image, currency, properties(unit_price, property_type, is_active)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function LegacyReveal({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={shown ? "kv-reveal" : "kv-reveal-pending"}>
      {children}
    </div>
  );
}

function Landing() {
  const projects = useProjects();
  const { session } = useSession();
  const signedIn = !!session;

  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center px-5 sm:px-8">
          <Brand tone="inverted" />
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className="text-onyx-foreground hover:bg-onyx-foreground/10"
            >
              {signedIn ? (
                <Link to="/dashboard">My dashboard</Link>
              ) : (
                <Link to="/auth">Sign in</Link>
              )}
            </Button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[92svh] w-full">
        <img
          src={assetUrl(heroAsset.url)}
          alt="Contemporary KAIVRA residences with landscaped courtyards at dusk"
          className="absolute inset-0 size-full object-cover"
          width={1280}
          height={784}
          fetchPriority="high"
        />
        <div className="hero-scrim absolute inset-0" />
        <div className="relative mx-auto flex min-h-[92svh] w-full max-w-7xl flex-col justify-end px-5 pb-16 pt-32 sm:px-8 sm:pb-24">
          <div className="max-w-2xl kv-rise">
            <div className="rule-gold mb-8" />
            <p className="eyebrow inline-block rounded-sm bg-info px-3 py-1.5 text-info-foreground">
              Smart Real Estate Investment Management
            </p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] text-onyx-foreground sm:text-7xl">
              Invest in the future you can own.
            </h1>
            <div className="mt-6 inline-block max-w-xl rounded-lg bg-onyx/60 px-4 py-3 backdrop-blur-md">
              <p className="text-base text-onyx-foreground sm:text-lg">
                Securely manage your real-estate investments, subscriptions and payments in one
                simple platform.
              </p>
            </div>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-13 px-8 text-sm tracking-[0.14em] uppercase">
                {signedIn ? (
                  <Link to="/application">Continue application</Link>
                ) : (
                  <Link to="/auth">Start investing</Link>
                )}
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 border-onyx-foreground/40 bg-transparent px-8 text-sm uppercase tracking-[0.14em] text-onyx-foreground hover:bg-onyx-foreground/10 hover:text-onyx-foreground"
              >
                {signedIn ? (
                  <Link to="/dashboard">Access my investment</Link>
                ) : (
                  <Link to="/auth">Access my investment</Link>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:grid-cols-3 sm:px-8">
          {[
            {
              icon: ShieldCheck,
              title: "Secure by design",
              body: "Private document storage and verified payment records.",
            },
            {
              icon: Sparkles,
              title: "Simple to complete",
              body: "A guided application you can finish from your phone.",
            },
            {
              icon: MapPin,
              title: "Premium projects",
              body: "Curated resort and residential investment opportunities.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-4">
              <item.icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="projects" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
        <LegacyReveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-primary kv-legacy" style={{ animationDelay: "0ms" }}>
                Featured opportunities
              </p>
              <h2
                className="mt-3 font-display text-4xl sm:text-5xl kv-legacy"
                style={{ animationDelay: "120ms" }}
              >
                Investment projects
              </h2>
            </div>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {projects.isLoading
              ? [0, 1].map((i) => <Skeleton key={i} className="h-[26rem] w-full rounded-lg" />)
              : null}

            {projects.isError ? (
              <p className="text-sm text-destructive">
                Projects could not be loaded right now. Please refresh and try again.
              </p>
            ) : null}

            {projects.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No investment projects have been published yet.
              </p>
            ) : null}

            {projects.data?.map((project, idx) => {
              const active = (project.properties ?? []).filter((p) => p.is_active);
              const from = active.length ? Math.min(...active.map((p) => Number(p.unit_price))) : 0;
              const types = Array.from(new Set(active.map((p) => p.property_type))).slice(0, 3);
              const delay = 240 + idx * 160;
              return (
                <article
                  key={project.id}
                  className="kv-legacy group overflow-hidden rounded-lg border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                      src={mediaSrc(project.hero_image)}
                      alt={project.name}
                      loading="lazy"
                      width={1920}
                      height={1088}
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden /> {project.location}
                    </p>
                    <h3 className="mt-3 font-display text-2xl leading-tight">{project.name}</h3>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {types.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-border bg-muted px-3 py-1 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <p className="eyebrow text-muted-foreground">Starting from</p>
                        <p className="font-display text-2xl text-primary">{formatCompact(from)}</p>
                      </div>
                      <Button asChild variant="outline" className="uppercase tracking-[0.12em]">
                        <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                          View project <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </LegacyReveal>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-20 sm:px-8 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-lg border border-border bg-onyx">
            <img
              src={assetUrl(adviserAsset.url)}
              alt="A KAIVRA investment adviser"
              loading="lazy"
              width={1119}
              height={1280}
              className="aspect-[4/5] size-full object-cover object-top"
            />
          </div>
          <div>
            <p className="eyebrow text-primary">Guided investing</p>
            <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
              An adviser beside you, from first enquiry to allocation.
            </h2>
            <p className="mt-5 text-sm text-muted-foreground sm:text-base">
              Every KAIVRA subscription is reviewed by a dedicated adviser who verifies your
              payments, confirms your documents and keeps your application moving — while your
              records stay private and fully in your name.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" className="uppercase tracking-[0.12em]">
                {signedIn ? (
                  <Link to="/application">Begin your application</Link>
                ) : (
                  <Link to="/auth">Speak to an adviser</Link>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative">
        <img
          src={assetUrl(residenceAsset.url)}
          alt="Signature KAIVRA residence exterior"
          loading="lazy"
          width={952}
          height={1280}
          className="h-[46svh] w-full object-cover"
        />
      </section>

      <section className="surface-onyx relative overflow-hidden">
        <div className="mx-auto w-full max-w-7xl px-5 py-24 text-center sm:px-8 sm:py-32">
          <LegacyReveal>
            <p
              className="font-display text-2xl tracking-[0.35em] text-gold sm:text-3xl kv-legacy"
              style={{ animationDelay: "0ms" }}
            >
              HUTU PRESTIGE
            </p>
            <div
              className="mx-auto mt-5 flex items-center justify-center gap-4 kv-legacy"
              style={{ animationDelay: "150ms" }}
            >
              <span className="h-px w-10 bg-gold/70 sm:w-16" />
              <span className="eyebrow text-gold">Abuja</span>
              <span className="h-px w-10 bg-gold/70 sm:w-16" />
            </div>
            <h2
              className="mx-auto mt-10 max-w-3xl font-display text-5xl leading-[1.05] text-onyx-foreground sm:text-7xl kv-legacy"
              style={{ animationDelay: "300ms" }}
            >
              Own more than <span className="text-gold">a property.</span>
            </h2>
            <div
              className="mx-auto mt-8 max-w-md rounded-sm border border-gold/40 bg-gold/10 px-6 py-3 kv-legacy"
              style={{ animationDelay: "450ms" }}
            >
              <p className="font-display text-xl tracking-[0.3em] text-gold sm:text-2xl">
                OWN A LEGACY
              </p>
            </div>
            <p
              className="mx-auto mt-10 max-w-xl text-sm text-onyx-foreground/70 sm:text-base kv-legacy"
              style={{ animationDelay: "600ms" }}
            >
              We deliver premium, affordable and secure properties for a better tomorrow.
            </p>
            <div className="mt-10 kv-legacy" style={{ animationDelay: "750ms" }}>
              <Button asChild size="lg" className="uppercase tracking-[0.14em]">
                <a href="#projects">
                  Explore projects <ArrowRight className="ml-2 size-4" />
                </a>
              </Button>
            </div>
          </LegacyReveal>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid w-full max-w-7xl items-start gap-10 px-5 py-20 sm:px-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <LegacyReveal>
            <div
              className="kv-legacy mx-auto max-w-sm overflow-hidden rounded-lg border border-border"
              style={{ animationDelay: "0ms" }}
            >
              <img
                src={assetUrl(teamChairman.url)}
                alt="Chief Andy Elerewe, Chairman of AIBEN Group"
                loading="lazy"
                className="aspect-[7/10] size-full object-cover object-top"
              />
              <div className="surface-onyx p-5 text-center">
                <p className="font-display text-xl text-gold">Chief Andy Elerewe</p>
                <p className="eyebrow mt-1 text-onyx-foreground/60">Chairman, AIBEN Group</p>
              </div>
            </div>
          </LegacyReveal>
          <LegacyReveal>
            <p className="eyebrow text-primary kv-legacy" style={{ animationDelay: "100ms" }}>
              Chairman's message
            </p>
            <h2
              className="mt-3 font-display text-4xl leading-tight sm:text-5xl kv-legacy"
              style={{ animationDelay: "200ms" }}
            >
              Welcome to the future. Welcome to <span className="text-primary">Hutu Prestige.</span>
            </h2>
            <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p className="kv-legacy" style={{ animationDelay: "300ms" }}>
                It is with immense pride and vision that I present to you Hutu Prestige — featured
                within one of Africa's most innovative mega city projects, HUTU Abuja City.
              </p>
              <p className="kv-legacy" style={{ animationDelay: "400ms" }}>
                At AIBEN Properties Ltd, we have spent over a decade building more than houses; we
                construct communities, foster connections, and curate lasting memories. Hutu
                Prestige is the culmination of this philosophy: a next-generation African urban
                model that is self-sustaining, secure, future-ready, and culturally expressive.
              </p>
              <p className="kv-legacy" style={{ animationDelay: "500ms" }}>
                This is not just a residential estate — it is Africa's first Polo &amp; Golf Resort
                Estate, connected by integrated power and sustainable living. A 1,300-hectare land
                space where natural beauty merges with architectural excellence, lakefront living,
                and world-class security that ensures absolute peace of mind.
              </p>
              <p className="kv-legacy" style={{ animationDelay: "600ms" }}>
                Hutu Prestige embodies our commitment to building a stronger Nigeria and Africa.
                Through innovation, sustainable practices and a dedication to excellence, we are
                creating a city where every resident can truly say:{" "}
                <span className="font-semibold text-primary">this is home</span>.
              </p>
            </div>
          </LegacyReveal>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <LegacyReveal>
            <div className="text-center">
              <p className="eyebrow text-primary kv-legacy" style={{ animationDelay: "0ms" }}>
                Leadership
              </p>
              <h2
                className="mt-3 font-display text-4xl sm:text-5xl kv-legacy"
                style={{ animationDelay: "120ms" }}
              >
                The Hutu team
              </h2>
              <p
                className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground kv-legacy"
                style={{ animationDelay: "240ms" }}
              >
                The people behind Hutu Prestige and AIBEN Group.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              {[
                {
                  asset: teamBenedicta,
                  name: "Engr. Benedicta Izehi Elerewe",
                  role: "Executive Director, AIBEN Group",
                  cred: "FCIB",
                },
                {
                  asset: teamCharles,
                  name: "QS Charles Agwam",
                  role: "General Manager, AIBEN Group",
                  cred: "MNIQS, RQS",
                },
                {
                  asset: teamRichard,
                  name: "Engr. Richard Ibi Efem",
                  role: "Project Manager, Hutu Prestige",
                  cred: "MNSE, COREN",
                },
                {
                  asset: teamJulient,
                  name: "Mrs Julient Aliyu",
                  role: "Personnel & Human Resource",
                },
                {
                  asset: teamWassim,
                  name: "Engr. Wassim Kiwan",
                  role: "Director of Infrastructure, Hutu Prestige",
                },
                {
                  asset: teamHassan,
                  name: "Arc. Hassan Jaafar",
                  role: "Deputy Infrastructure Director, Hutu Prestige",
                },
                {
                  asset: teamJoseph,
                  name: "Joseph Izonofe Osoria",
                  role: "Head, Corporate & Business Development",
                },
                { asset: teamNkiruka, name: "Nkiruka Peace Onyeugo", role: "Head of Marketing" },
                {
                  asset: teamYarison,
                  name: "Yarison Hope",
                  role: "Head, Media & Strategy",
                  cred: "ARPA",
                },
              ].map((member, idx) => (
                <article
                  key={member.name}
                  className="kv-legacy group overflow-hidden rounded-lg border border-border bg-card text-center transition-transform duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${300 + idx * 90}ms` }}
                >
                  <div className="aspect-[9/10] overflow-hidden">
                    <img
                      src={assetUrl(member.asset.url)}
                      alt={`${member.name}, ${member.role}`}
                      loading="lazy"
                      className="size-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold leading-tight">{member.name}</h3>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {member.role}
                      {member.cred ? <span className="block text-gold">{member.cred}</span> : null}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </LegacyReveal>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <LegacyReveal>
            <div className="text-center">
              <p className="eyebrow text-primary kv-legacy" style={{ animationDelay: "0ms" }}>
                Trusted partners
              </p>
              <h2
                className="mt-3 font-display text-4xl sm:text-5xl kv-legacy"
                style={{ animationDelay: "120ms" }}
              >
                Our partners
              </h2>
              <p
                className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground kv-legacy"
                style={{ animationDelay: "240ms" }}
              >
                KAIVRA works with established developers and investment firms to bring you secure
                opportunities.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
              {[
                {
                  asset: partnerHutuAsset,
                  alt: "Hutu Prestige Polo Lake Resort — polo players and gold shield crest",
                  name: "Hutu Prestige Polo Lake Resort",
                  sub: "Airport Road, Lugbe South District, Abuja",
                },
                {
                  asset: partnerAbibeeAsset,
                  alt: "AbiBee Works & Services — Real Estate Investment Ltd",
                  name: "AbiBee Works & Services",
                  sub: "Real Estate Investment Ltd",
                },
              ].map((partner, idx) => (
                <article
                  key={partner.name}
                  className="kv-legacy group overflow-hidden rounded-lg border border-border bg-onyx transition-transform duration-300 hover:-translate-y-1"
                  style={{ animationDelay: `${360 + idx * 150}ms` }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={assetUrl(partner.asset.url)}
                      alt={partner.alt}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5 text-center">
                    <h3 className="font-display text-lg text-onyx-foreground">{partner.name}</h3>
                    <p className="eyebrow mt-1 text-onyx-foreground/60">{partner.sub}</p>
                  </div>
                </article>
              ))}
            </div>
          </LegacyReveal>
        </div>
      </section>

      <section id="contact" className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
          <p className="eyebrow text-muted-foreground">Contact</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl">Speak with a KAIVRA adviser</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Send us a message and a member of the KAIVRA team will respond using the contact
            details below.
          </p>
          <div className="mt-8">
            <ContactForm />
          </div>
        </div>
      </section>

      <footer className="surface-onyx">

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 lg:flex-row lg:items-start lg:justify-between">
          <Brand tone="inverted" withTagline />
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 size-4 text-gold" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-onyx-foreground/60">
                  Call us
                </p>
                <a
                  href="tel:+2347058926912"
                  className="mt-1 block text-sm text-onyx-foreground hover:text-gold"
                >
                  +234 705 892 6912
                </a>
                <a
                  href="tel:09125067938"
                  className="block text-sm text-onyx-foreground hover:text-gold"
                >
                  0912 506 7938
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 text-gold" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-onyx-foreground/60">
                  Email support
                </p>
                <a
                  href="mailto:support@kaivra.com"
                  className="mt-1 block text-sm text-onyx-foreground hover:text-gold"
                >
                  support@kaivra.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 text-gold" aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-onyx-foreground/60">
                  Explore
                </p>
                <Link
                  to="/real-estate-investment-abuja"
                  className="mt-1 block text-sm text-onyx-foreground hover:text-gold"
                >
                  Real estate investment in Abuja
                </Link>
              </div>
            </div>
          </div>
          <p className="text-xs text-onyx-foreground/60 lg:self-center">
            © {new Date().getFullYear()} KAIVRA. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
