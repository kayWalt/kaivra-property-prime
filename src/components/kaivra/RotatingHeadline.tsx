import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PHRASES = [
  "Invest in the future you can own.",
  "Own More Than A PROPERTY. Own A Legacy.",
];

const INTERVAL_MS = 5000;
const TRANSITION_MS = 700;

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

export function RotatingHeadline({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setIsTransitioning(true);
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % PHRASES.length);
        setIsTransitioning(false);
      }, TRANSITION_MS);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const current = PHRASES[index]!;

  return (
    <h1
      className={cn(
        "mt-4 font-display text-5xl leading-[1.05] text-onyx-foreground sm:text-7xl",
        className,
      )}
      aria-live={reducedMotion ? "polite" : "off"}
      aria-atomic
    >
      <span
        className={cn(
          "inline-block transition-all duration-700 ease-out",
          isTransitioning && !reducedMotion
            ? "translate-y-3 opacity-0"
            : "translate-y-0 opacity-100",
        )}
      >
        {current}
      </span>
    </h1>
  );
}

export default RotatingHeadline;
