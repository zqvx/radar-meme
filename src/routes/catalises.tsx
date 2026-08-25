import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mergeCatalyses, useUserCatalyses } from "@/lib/storage";
import type { Catalysis } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/catalises")({
  component: CatalisesPage,
});

function CatalisesPage() {
  const [user, setUser] = useUserCatalyses();
  const all = mergeCatalyses(user);
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");

  const upcoming = useMemo(
    () => all.filter((c) => c.date >= today),
    [all, today],
  );
  const past = useMemo(
    () => all.filter((c) => c.date < today).slice(-8).reverse(),
    [all, today],
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const item: Catalysis = {
      id: `user-${crypto.randomUUID()}`,
      title: title.trim(),
      date,
      note: note.trim(),
      tag: tag.trim() || undefined,
      source: "user",
    };
    setUser((prev) => [...prev, item]);
    setTitle("");
    setNote("");
    setTag("");
  }

  function remove(id: string) {
    setUser((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">
        Catálises
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
        Datas, não vibes.
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Eventos curados mais os teus. Guardados só neste browser.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-medium text-muted">A seguir</h2>
            <ul className="mt-3 space-y-3">
              {upcoming.map((c) => (
                <EventCard
                  key={c.id}
                  item={c}
                  today={today}
                  onRemove={c.source === "user" ? remove : undefined}
                />
              ))}
              {upcoming.length === 0 ? (
                <li className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted shadow-[var(--shadow-border)]">
                  Sem datas futuras. Adiciona uma à direita.
                </li>
              ) : null}
            </ul>
          </section>
          {past.length > 0 ? (
            <section>
              <h2 className="text-sm font-medium text-muted">Já passaram</h2>
              <ul className="mt-3 space-y-3 opacity-70">
                {past.map((c) => (
                  <EventCard key={c.id} item={c} today={today} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <form
          onSubmit={add}
          className="h-fit rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:sticky lg:top-8"
        >
          <h2 className="flex items-center gap-2 font-medium">
            <Plus className="size-4" />
            Nova catálise
          </h2>
          <label className="mt-4 block text-xs text-subtle">
            Título
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Listagem, unlock, collab…"
              required
            />
          </label>
          <label className="mt-3 block text-xs text-subtle">
            Data
            <Input
              className="mt-1"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="mt-3 block text-xs text-subtle">
            Etiqueta
            <Input
              className="mt-1"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Listagem, sazonal…"
            />
          </label>
          <label className="mt-3 block text-xs text-subtle">
            Nota
            <Textarea
              className="mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Porque é que esta data importa"
            />
          </label>
          <Button type="submit" className="mt-4 w-full">
            Guardar
          </Button>
        </form>
      </div>
    </div>
  );
}

function EventCard({
  item,
  today,
  onRemove,
}: {
  item: Catalysis;
  today: string;
  onRemove?: (id: string) => void;
}) {
  const days = Math.round(
    (new Date(item.date).getTime() - new Date(today).getTime()) / 86_400_000,
  );
  const when =
    days === 0 ? "hoje" : days === 1 ? "amanhã" : days > 1 ? `em ${days}d` : `há ${-days}d`;

  return (
    <li className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="size-4 text-subtle" />
            <h3 className="font-medium tracking-tight">{item.title}</h3>
            {item.tag ? (
              <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">
                {item.tag}
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                item.source === "user"
                  ? "bg-accent/10 text-accent"
                  : "bg-elevated text-muted",
              )}
            >
              {item.source === "user" ? "tua" : "curada"}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-subtle">
            {item.date} · {when}
          </p>
          {item.note ? (
            <p className="mt-2 text-sm text-muted">{item.note}</p>
          ) : null}
        </div>
        {onRemove ? (
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Apagar"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
