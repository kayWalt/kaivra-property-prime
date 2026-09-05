import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { peekSession } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/kaivra/Brand";
import { parseGallery, type GalleryImage } from "@/components/kaivra/ProjectImageFields";
import { PlotPriceTag } from "@/components/kaivra/PlotPriceTag";

import { formatNaira } from "@/lib/kaivra";
import { mediaSrc, FALLBACK_PROPERTY_IMAGE } from "@/lib/media";

const SITE_URL = "https://kaivraa.com";

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("projects")
      .select("name, location, description, hero_image")
      .eq("id", params.projectId)
      .maybeSingle();
    return { project: data ?? null };
  },
  head: ({ params, loaderData }) => {
    const project = loaderData?.project ?? null;
    const url = `${SITE_URL}/projects/${params.projectId}`;
    const title = project
      ? `${project.name} — ${project.location} | KAIVRA`
      : "KAIVRA | Investment Opportunity";
    const description = project
      ? `${project.name} in ${project.location}. ${project.description ?? ""}`
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 155)
      : "Explore property options, sizes, prices and payment plans for this KAIVRA real-estate project.";
    const image = project?.hero_image ? mediaSrc(project.hero_image) : null;
    const absoluteImage = image?.startsWith("https://") ? image : null;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(absoluteImage
          ? [
              { property: "og:image", content: absoluteImage },
              { name: "twitter:image", content: absoluteImage },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: project
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: project.name,
                description,
                ...(absoluteImage ? { image: absoluteImage } : {}),
                url,
                brand: { "@type": "Brand", name: "KAIVRA" },
                category: "Real Estate Investment",
                ...(project.location
                  ? {
                      areaServed: {
                        "@type": "Place",
                        name: project.location,
                      },
                    }
                  : {}),
              }),
            },
          ]
        : [],
    };
  },
  component: ProjectDetail,
});


function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    // Use the shared session store first so the button navigates instantly
    // instead of waiting on an auth round trip.
    const cached = peekSession();
    const session = cached.session ?? (await supabase.auth.getSession()).data.session;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    navigate({
      to: "/application",
      search: propertyId ? { project: projectId, property: propertyId } : { project: projectId },
    });
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
  const heroImage = mediaSrc(project.hero_image);
  // Hero first, then every gallery image, so the hero click opens the same
  // viewer and the rest can be browsed from there.
  const allImages: GalleryImage[] = [{ url: heroImage, caption: project.name }, ...gallery];

  return (
    <div className="min-h-screen bg-background">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center px-5 sm:px-8">
          <Brand tone="inverted" />
          <Button
            asChild
            variant="ghost"
            className="ml-auto text-onyx-foreground hover:bg-onyx-foreground/10"
          >
            <Link to="/">
              <ArrowLeft className="mr-2 size-4" /> All projects
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative h-[70svh] min-h-[26rem] w-full">
        <button
          type="button"
          className="absolute inset-0 block size-full cursor-zoom-in"
          onClick={() => setLightboxIndex(0)}
          aria-label={`View all ${allImages.length} ${allImages.length === 1 ? "photo" : "photos"} of ${project.name}`}
        >
          <img
            src={heroImage}
            alt={project.name}
            className="absolute inset-0 size-full object-cover"
            width={1920}
            height={1088}
            fetchPriority="high"
          />
        </button>
        <div className="hero-scrim pointer-events-none absolute inset-0" />
        <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-7xl flex-col justify-end px-5 pb-14 sm:px-8">
          <div className="rule-gold mb-6" />
          <p className="eyebrow flex items-center gap-1.5 text-gold">
            <MapPin className="size-3.5" aria-hidden /> {project.location}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl text-onyx-foreground sm:text-6xl">
            {project.name}
          </h1>
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-onyx/60 px-3 py-1.5 text-xs text-onyx-foreground backdrop-blur">
            <Images className="size-3.5" aria-hidden /> Tap to view {allImages.length}{" "}
            {allImages.length === 1 ? "photo" : "photos"}
          </span>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="eyebrow text-primary">About this project</p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {project.description}
            </p>
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
            <Button
              className="mt-6 h-12 w-full uppercase tracking-[0.14em]"
              onClick={() => invest()}
            >
              Subscribe / Invest
            </Button>
          </aside>
        </div>

        {gallery.length > 0 ? (
          <>
            <h2 className="mt-16 font-display text-3xl sm:text-4xl">Gallery</h2>
            <Lightbox
              images={allImages}
              projectName={project.name}
              gridOffset={1}
              openIndex={lightboxIndex}
              onOpenChange={setLightboxIndex}
            />
          </>
        ) : (
          <Lightbox
            images={allImages}
            projectName={project.name}
            openIndex={lightboxIndex}
            onOpenChange={setLightboxIndex}
            hideGrid
          />
        )}

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
              <article
                key={property.id}
                className="overflow-hidden rounded-lg border border-border bg-card shadow-card"
              >
                <div className="relative">
                  <img
                    src={mediaSrc(images[0], FALLBACK_PROPERTY_IMAGE)}
                    alt={property.name}
                    loading="lazy"
                    width={1280}
                    height={960}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <PlotPriceTag
                    sizeLabel={property.size_label}
                    price={property.unit_price}
                    currency={project.currency}
                  />
                </div>

                <div className="p-5">
                  <p className="eyebrow text-gold-foreground">{property.size_label}</p>
                  <h3 className="mt-2 text-lg font-semibold leading-snug">{property.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{property.property_type}</p>
                  <p className="mt-4 font-display text-2xl text-primary">
                    {formatNaira(property.unit_price, project.currency)}
                  </p>
                  <Button
                    className="mt-5 h-11 w-full uppercase tracking-[0.12em]"
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

/**
 * Responsive gallery with a full-screen viewer. Supports keyboard arrows on
 * desktop and horizontal swipe on touch devices.
 */
function Lightbox({
  images,
  projectName,
  gridOffset = 0,
  openIndex,
  onOpenChange,
  hideGrid = false,
}: {
  images: GalleryImage[];
  projectName: string;
  gridOffset?: number;
  openIndex: number | null;
  onOpenChange: (index: number | null) => void;
  hideGrid?: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  const setOpenIndex = onOpenChange;

  const step = useCallback(
    (delta: number) => {
      if (openIndex === null) return;
      setOpenIndex((openIndex + delta + images.length) % images.length);
    },
    [images.length, openIndex, setOpenIndex],
  );

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  const active = openIndex === null ? null : images[openIndex];

  return (
    <>
      <div
        className={hideGrid ? "hidden" : "mt-8 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"}
      >
        {images.slice(gridOffset).map((image, index) => (
          <figure
            key={`${image.url}-${index}`}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <button
              type="button"
              className="block w-full"
              onClick={() => setOpenIndex(index + gridOffset)}
              aria-label={`Open image ${index + 1} full screen`}
            >
              <img
                src={image.url}
                alt={image.caption || `${projectName} image ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
              />
            </button>
            {image.caption ? (
              <figcaption className="p-4 text-sm text-muted-foreground">{image.caption}</figcaption>
            ) : null}
          </figure>
        ))}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-onyx/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${projectName} gallery`}
          onClick={() => setOpenIndex(null)}
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const end = e.changedTouches[0]?.clientX ?? null;
            if (start === null || end === null) return;
            if (Math.abs(end - start) > 45) step(end < start ? 1 : -1);
            touchStart.current = null;
          }}
        >
          <img
            src={active.url}
            alt={active.caption || projectName}
            className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {active.caption ? (
            <p className="mt-4 max-w-2xl text-center text-sm text-onyx-foreground/80">
              {active.caption}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous image"
              onClick={() => step(-1)}
            >
              <ChevronLeft className="size-5" />
            </Button>
            <span className="text-xs text-onyx-foreground/70">
              {(openIndex ?? 0) + 1} / {images.length}
            </span>
            <Button variant="outline" size="icon" aria-label="Next image" onClick={() => step(1)}>
              <ChevronRight className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close gallery"
              onClick={() => setOpenIndex(null)}
            >
              <X className="size-5 text-onyx-foreground" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
