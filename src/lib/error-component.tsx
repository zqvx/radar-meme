import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-bad" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-medium tracking-tight">Algo correu mal</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "Erro inesperado. Recarrega a página."}
      </p>
    </main>
  );
}
