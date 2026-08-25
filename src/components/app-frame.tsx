import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  Layers,
  Radar,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Radar", icon: Radar },
  { to: "/pick", label: "Pick", icon: Sparkles },
  { to: "/narrativas", label: "Narrativas", icon: Layers },
  { to: "/xray", label: "X-Ray", icon: ScanSearch },
  { to: "/catalises", label: "Catálises", icon: CalendarDays },
  { to: "/diario", label: "Diário", icon: BookOpen },
] as const;

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Saltar para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-bg px-3 py-6 md:flex">
        <div className="px-3">
          <p className="font-mono text-xs tracking-widest text-subtle uppercase">
            Scanner
          </p>
          <p className="mt-1 text-lg font-medium tracking-tight">Radar Meme</p>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Secções">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                  active
                    ? "bg-elevated text-fg"
                    : "text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-3 text-xs leading-relaxed text-subtle">
          Análise, não conselho. 7 em 10 destas moedas perdem 70–100%.
        </p>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-sm md:hidden">
        <div>
          <p className="font-mono text-xs tracking-widest text-subtle uppercase">
            Scanner
          </p>
          <p className="text-base font-medium tracking-tight">Radar Meme</p>
        </div>
      </header>

      <main
        id="conteudo"
        className="px-4 pb-28 pt-6 md:ml-56 md:px-8 md:pb-12 md:pt-8"
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
        aria-label="Secções"
      >
        <ul className="grid grid-cols-6">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
