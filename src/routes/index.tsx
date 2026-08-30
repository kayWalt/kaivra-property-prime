import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/kaivra/Brand";
import { useSession } from "@/hooks/useAuth";
import { formatCompact } from "@/lib/kaivra";
import heroAsset from "@/assets/kaivra-22-00-40.jpg.asset.json";
import adviserAsset from "@/assets/kaivra-22-00-16.jpg.asset.json";
import residenceAsset from "@/assets/kaivra-22-00-51.jpg.asset.json";


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
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function useProjects() {
  return useQuery({
    queryKey: ["public-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, location, description, hero_image, currency, properties(unit_price, property_type, is_active)")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function Landing() {
  const projects = useProjects();

  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center px-5 sm:px-8">
          <Brand tone="inverted" />
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" className="text-onyx-foreground hover:bg-onyx-foreground/10">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative min-h-[92svh] w-full">
        <img
          src="/images/hero.jpg"
          alt="Aerial view of a luxury gated estate at dusk"
          className="absolute inset-0 size-full object-cover"
          width={1920}
          height={1200}
          fetchPriority="high"
        />
        <div className="hero-scrim absolute inset-0" />
        <div className="relative mx-auto flex min-h-[92svh] w-full max-w-7xl flex-col justify-end px-5 pb-16 pt-32 sm:px-8 sm:pb-24">
          <div className="max-w-2xl kv-rise">
            <div className="rule-gold mb-8" />
            <p className="eyebrow text-gold">Smart Real Estate Investment Management</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] text-onyx-foreground sm:text-7xl">
              Invest in the future you can own.
            </h1>
            <p className="mt-6 max-w-xl text-base text-onyx-foreground/80 sm:text-lg">
              Securely manage your real-estate investments, subscriptions and payments in one simple platform.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-13 px-8 text-sm tracking-[0.14em] uppercase">
                <Link to="/auth">Start investing</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-13 border-onyx-foreground/40 bg-transparent px-8 text-sm uppercase tracking-[0.14em] text-onyx-foreground hover:bg-onyx-foreground/10 hover:text-onyx-foreground"
              >
                <Link to="/auth">Access my investment</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:grid-cols-3 sm:px-8">
          {[
            { icon: ShieldCheck, title: "Secure by design", body: "Private document storage and verified payment records." },
            { icon: Sparkles, title: "Simple to complete", body: "A guided application you can finish from your phone." },
            { icon: MapPin, title: "Premium projects", body: "Curated resort and residential investment opportunities." },
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

      <section className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Featured opportunities</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">Investment projects</h2>
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
            <p className="text-sm text-muted-foreground">No investment projects have been published yet.</p>
          ) : null}

          {projects.data?.map((project) => {
            const active = (project.properties ?? []).filter((p) => p.is_active);
            const from = active.length ? Math.min(...active.map((p) => Number(p.unit_price))) : 0;
            const types = Array.from(new Set(active.map((p) => p.property_type))).slice(0, 3);
            return (
              <article
                key={project.id}
                className="group overflow-hidden rounded-lg border border-border bg-card shadow-card transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={project.hero_image ?? "/images/project-mountain.jpg"}
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
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {types.map((t) => (
                      <span key={t} className="rounded-full border border-border bg-muted px-3 py-1 text-xs">
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
      </section>

      <footer className="surface-onyx">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Brand tone="inverted" withTagline />
          <p className="text-xs text-onyx-foreground/60">
            © {new Date().getFullYear()} KAIVRA. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
