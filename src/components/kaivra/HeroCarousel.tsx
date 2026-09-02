import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { assetUrl, FALLBACK_PROJECT_IMAGE } from "@/lib/media";
import { cn } from "@/lib/utils";

import slide1 from "@/assets/kaivra-22-00-40.jpg.asset.json";
import slide2 from "@/assets/kaivra-22-00-51.jpg.asset.json";
import slide3 from "@/assets/kaivra-duplex-option-1.jpg.asset.json";

const SLIDES = [
  {
    url: slide1.url,
    alt: "Modern luxury KAIVRA residential building with vehicles parked in the driveway",
  },
  {
    url: slide2.url,
    alt: "Modern multi-level luxury residential development with landscaped surroundings",
  },
  {
    url: slide3.url,
    alt: "Architectural renders of the proposed five bedroom duplex, option one",
  },
] as const;

const INTERVAL_MS = 5500;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Premium auto-rotating hero carousel: crossfade + restrained Ken Burns pan.
 * Images come from the existing Lovable asset pipeline (CDN), so they resolve
 * identically on the preview and on kaivraa.com / www.kaivraa.com.
 */
export function HeroCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const reducedMotion = usePrefersReducedMotion();
  const touchStartX = useRef<number | null>(null);

  const sources = useMemo(() => SLIDES.map((s) => assetUrl(s.url)), []);

  const goTo = useCallback((next: number) => {
    setIndex((current) => {
      const total = SLIDES.length;
      return ((next % total) + total) % total;
    });
  }, []);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-rotation. The effect re-runs on every index change, so any manual
  // interaction naturally resets the timer.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [index, playing]);

  // Preload the upcoming image so the crossfade never shows a gap.
  useEffect(() => {
    const upcoming = new Image();
    upcoming.src = sources[(index + 1) % SLIDES.length]!;
  }, [index, sources]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
  };

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="KAIVRA property gallery"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchStartX.current = null;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) < 48) return;
        if (delta < 0) next();
        else prev();
      }}
    >
      {SLIDES.map((slide, i) => {
        const active = i === index;
        return (
          <div
            key={slide.url}
            className="absolute inset-0 transition-opacity duration-1000 ease-out"
            style={{ opacity: active ? 1 : 0 }}
            aria-hidden={!active}
          >
            <img
              src={sources[i]}
              alt={slide.alt}
              className={cn(
                "size-full object-cover",
                active && !reducedMotion && "kv-kenburns",
              )}
              width={1600}
              height={980}
              decoding="async"
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "low"}
              onError={(event) => {
                const img = event.currentTarget;
                if (img.src !== FALLBACK_PROJECT_IMAGE) img.src = FALLBACK_PROJECT_IMAGE;
              }}
            />
          </div>
        );
      })}

      <div className="hero-scrim pointer-events-none absolute inset-0" />

      {/* Controls: pinned to the top-right on mobile and bottom-right from sm up,
          so they never sit over the headline, copy or CTAs. */}
      <div className="absolute right-5 top-24 z-10 flex items-center gap-2 sm:bottom-10 sm:right-8 sm:top-auto">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous property image"
          className="hidden size-10 items-center justify-center rounded-full border border-onyx-foreground/30 bg-onyx/40 text-onyx-foreground backdrop-blur-md transition-colors hover:bg-onyx/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:inline-flex"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next property image"
          className="hidden size-10 items-center justify-center rounded-full border border-onyx-foreground/30 bg-onyx/40 text-onyx-foreground backdrop-blur-md transition-colors hover:bg-onyx/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:inline-flex"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>

        <div className="flex items-center gap-1.5 rounded-full border border-onyx-foreground/25 bg-onyx/40 px-3 py-2 backdrop-blur-md">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.url}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show property image ${i + 1} of ${SLIDES.length}`}
              aria-current={i === index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                i === index
                  ? "w-6 bg-gold"
                  : "w-1.5 bg-onyx-foreground/50 hover:bg-onyx-foreground/80",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause automatic image rotation" : "Resume automatic image rotation"}
          className="inline-flex size-10 items-center justify-center rounded-full border border-onyx-foreground/30 bg-onyx/40 text-onyx-foreground backdrop-blur-md transition-colors hover:bg-onyx/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export default HeroCarousel;
