import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/kaivra/Brand";
import { mediaSrc, FALLBACK_PROPERTY_IMAGE } from "@/lib/media";
import { formatNaira } from "@/lib/kaivra";

const SITE_URL = "https://kaivraa-com.lovable.app";
const PAGE_URL = `${SITE_URL}/real-estate-investment-abuja`;

export const Route = createFileRoute("/real-estate-investment-abuja")({
  head: () => ({
    meta: [
      { title: "Real Estate Investment in Abuja | KAIVRA" },
      {
        name: "description",
        content:
          "Invest in verified Abuja real estate with KAIVRA. Explore structured subscriptions to premium developments across Abuja with flexible payment plans and adviser support.",
      },
      { property: "og:title", content: "Real Estate Investment in Abuja | KAIVRA" },
      {
        property: "og:description",
        content:
          "Structured, verified real-estate investment subscriptions in Abuja — flexible payment plans, dedicated advisers, and full payment tracking.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Real Estate Investment in Abuja | KAIVRA",
          url: PAGE_URL,
          about: {
            "@type": "Thing",
            name: "Real estate investment in Abuja, Nigeria",
          },
          provider: { "@type": "Organization", name: "KAIVRA" },
        }),
      },
    ],
  }),
  component: AbujaInvestmentPage,
});

interface ProjectRow {
  id: string;
  name: string;
  location: string;
  description: string | null;
  hero_image: string | null;
  price: number | null;
}

function AbujaInvestmentPage() {
  const { data: projects } = useQuery({
    queryKey: ["abuja-page-projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, location, description, hero_image, price")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as ProjectRow[];
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <Link to="/" aria-label="KAIVRA home">
          <Brand />
        </Link>
        <Button asChild>
          <Link to="/auth">Get started</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="py-12 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary">
            Abuja, Nigeria
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            Real Estate Investment in Abuja
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Abuja is Nigeria's purpose-built capital and one of its fastest-growing property
            markets. KAIVRA gives investors a simple, transparent way to subscribe to verified
            developments across the city — with flexible payment plans, dedicated advisers, and a
            full record of every payment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Start investing <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#opportunities">View opportunities</a>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: TrendingUp,
              title: "A growing capital",
              body: "As the seat of Nigeria's federal government, Abuja attracts sustained housing and commercial demand, supporting long-term property value growth.",
            },
            {
              icon: ShieldCheck,
              title: "Verified developments",
              body: "Every project on KAIVRA is reviewed before listing, and every subscription is verified by our team before units are allocated.",
            },
            {
              icon: Users,
              title: "Adviser support",
              body: "A dedicated KAIVRA adviser guides you from application through allocation, inspection scheduling, and payment tracking.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <h2 className="mt-4 font-display text-xl">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </section>

        <section id="opportunities" className="mt-16">
          <h2 className="font-display text-3xl">Current Abuja opportunities</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Browse the live developments currently open for subscription on KAIVRA.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(projects ?? []).map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
              >
                <img
                  src={mediaSrc(project.hero_image) ?? FALLBACK_PROPERTY_IMAGE}
                  alt={`${project.name} — ${project.location}`}
                  loading="lazy"
                  className="h-44 w-full object-cover transition group-hover:scale-[1.02]"
                />
                <div className="p-5">
                  <h3 className="font-display text-lg">{project.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {project.location}
                  </p>
                  {project.price != null && (
                    <p className="mt-2 text-sm font-semibold text-primary">
                      From {formatNaira(project.price)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
            {projects && projects.length === 0 && (
              <p className="text-muted-foreground">
                New opportunities are opening soon — create an account to be notified.
              </p>
            )}
          </div>
        </section>

        <section className="mt-16 rounded-2xl surface-onyx p-8 text-center sm:p-12">
          <h2 className="font-display text-2xl sm:text-3xl">
            Start your Abuja investment journey
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Create a free KAIVRA account, choose a development, and subscribe with a payment plan
            that fits you. Our advisers verify every step.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/auth">Create your account</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
