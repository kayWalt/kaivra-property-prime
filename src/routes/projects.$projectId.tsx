import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/kaivra/Brand";
import { parseGallery } from "@/components/kaivra/ProjectImageFields";
import { formatNaira } from "@/lib/kaivra";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "KAIVRA | Investment Opportunity" },
      {
        name: "description",
        content: "Explore property options, sizes, prices and payment plans for this KAIVRA real-estate project.",
      },
      { property: "og:title", content: "KAIVRA | Investment Opportunity" },
      { property: "og:description", content: "Premium residential investment opportunity on KAIVRA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, properties(*)")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function invest(propertyId?: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/auth" });
      return;
    }
    navigate({ to: "/application", search: propertyId ? { project: projectId, property: propertyId } : { project: projectId } });
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
        <Skeleton className="h-[50vh] w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-3xl">Project not found</h1>
        <p className="text-sm text-muted-foreground">
          This investment project is unavailable or is no longer published.
        </p>
        <Button asChild>
          <Link to="/">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const project = query.data;
  const properties = (project.properties ?? []).filter((p) => p.is_active);
  const gallery = parseGallery(project.gallery_images);

  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center px-5 sm:px-8">
          <Brand tone="inverted" />
          <Button asChild variant="ghost" className="ml-auto text-onyx-foreground hover:bg-onyx-foreground/10">
            <Link to="/">
              <ArrowLeft className="mr-2 size-4" /> All projects
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative h-[70svh] min-h-[26rem] w-full">
        <img
          src={project.hero_image ?? "/images/project-mountain.jpg"}
          alt={project.name}
          className="absolute inset-0 size-full object-cover"
          width={1920}
          height={1088}
          fetchPriority="high"
        />
        <div className="hero-scrim absolute inset-0" />
        <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col justify-end px-5 pb-14 sm:px-8">
          <div className="rule-gold mb-6" />
          <p className="eyebrow flex items-center gap-1.5 text-gold">
            <MapPin className="size-3.5" aria-hidden /> {project.location}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl text-onyx-foreground sm:text-6xl">{project.name}</h1>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="eyebrow text-primary">About this project</p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{project.description}</p>
          </div>
          <aside className="rounded-lg border border-border bg-card p-6 shadow-card">
            <p className="eyebrow text-muted-foreground">Payment plans</p>
            <ul className="mt-3 space-y-2 text-sm">
              {(project.payment_plans as string[]).map((plan) => (
                <li key={plan} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gold" aria-hidden /> {plan}
                </li>
              ))}
            </ul>
            <Button className="mt-6 h-12 w-full uppercase tracking-[0.14em]" onClick={() => invest()}>
              Subscribe / Invest
            </Button>
          </aside>
        </div>

        {gallery.length > 0 ? (
          <>
            <h2 className="mt-16 font-display text-4xl">Gallery</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((image, index) => (
                <figure key={`${image.url}-${index}`} className="overflow-hidden rounded-lg border border-border bg-card">
                  <img
                    src={image.url}
                    alt={image.caption || `${project.name} image ${index + 1}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {image.caption ? (
                    <figcaption className="p-4 text-sm text-muted-foreground">{image.caption}</figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </>
        ) : null}

        <h2 className="mt-16 font-display text-4xl">Property options</h2>
        {properties.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Property options for this project are being finalised. Please check back shortly.
          </p>
        ) : null}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const images = (property.image_urls as string[]) ?? [];
            return (
              <article key={property.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <img
                  src={images[0] ?? "/images/property-terrace.jpg"}
                  alt={property.name}
                  loading="lazy"
                  width={1280}
                  height={960}
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="p-5">
                  <p className="eyebrow text-gold-foreground">{property.size_label}</p>
                  <h3 className="mt-2 text-lg font-semibold leading-snug">{property.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{property.property_type}</p>
                  <p className="mt-4 font-display text-2xl text-primary">
                    {formatNaira(property.unit_price, project.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {property.units_available > 0 ? `${property.units_available} units available` : "Sold out"}
                  </p>
                  <Button
                    className="mt-5 h-11 w-full uppercase tracking-[0.12em]"
                    variant={property.units_available > 0 ? "default" : "outline"}
                    disabled={property.units_available <= 0}
                    onClick={() => invest(property.id)}
                  >
                    Subscribe / Invest
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
