import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Brand } from "@/components/kaivra/Brand";
import { ThemeToggle } from "@/components/kaivra/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/hooks/useAuth";

const LINKS = [{ to: "/", label: "Home" }, { to: "/properties", label: "Property Listings" }] as const;

export function PublicSiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const { session } = useSession();
  const linkClass = overlay ? "text-onyx-foreground/90 hover:text-gold" : "text-foreground/80 hover:text-foreground";
  return (
    <header className={overlay ? "fixed inset-x-0 top-0 z-30 border-b border-onyx-foreground/10 bg-onyx/70 backdrop-blur-md" : "sticky top-0 z-30 border-b border-border bg-background/90 shadow-sm backdrop-blur-md"}>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-5 sm:h-20 sm:px-8">
        <Brand tone={overlay ? "inverted" : "default"} />
        <nav aria-label="Primary" className="ml-12 hidden items-center gap-7 lg:flex">
          {LINKS.map((item) => <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === "/" }} className={`kv-nav-link text-xs uppercase tracking-[0.16em] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${linkClass}`} activeProps={{ className: overlay ? "text-gold" : "text-primary" }}>{item.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className={overlay ? "hidden w-auto border-onyx-foreground/25 bg-onyx-foreground/10 sm:inline-flex" : "hidden sm:inline-flex"} showLabels={false} />
          <Button asChild variant="ghost" className={overlay ? "text-onyx-foreground hover:bg-onyx-foreground/10" : undefined}>
            <Link to={session ? "/dashboard" : "/auth"}>{session ? "My dashboard" : "Sign in"}</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open menu" className={overlay ? "min-h-11 min-w-11 text-onyx-foreground hover:bg-onyx-foreground/10 lg:hidden" : "min-h-11 min-w-11 lg:hidden"}><Menu className="size-5" /></Button></SheetTrigger>
            <SheetContent side="right" className="w-[82vw] max-w-xs"><SheetHeader><SheetTitle className="font-display tracking-[0.18em]">KAIVRA</SheetTitle></SheetHeader><nav aria-label="Mobile" className="mt-6 flex flex-col gap-1 px-4">{LINKS.map((item) => <Button key={item.to} asChild variant="ghost" className="h-12 justify-start" onClick={() => setOpen(false)}><Link to={item.to}>{item.label}</Link></Button>)}</nav><div className="mt-6 px-4"><ThemeToggle /></div></SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
