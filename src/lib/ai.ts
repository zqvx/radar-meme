import { createServerFn } from "@tanstack/react-start";

export const readNarrative = createServerFn({ method: "POST" })
  .validator(
    (d: {
      name: string;
      symbol: string;
      description?: string;
      socials?: string;
      marketCap: number;
      age: string;
      flags: string;
    }) => {
      return {
        name: String(d.name).slice(0, 80),
        symbol: String(d.symbol).slice(0, 24),
        description: String(d.description ?? "").slice(0, 600),
        socials: String(d.socials ?? "").slice(0, 300),
        marketCap: Number(d.marketCap) || 0,
        age: String(d.age).slice(0, 40),
        flags: String(d.flags).slice(0, 400),
      };
    },
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "Leitura de narrativa indisponível" };
    }
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "És um analista céptico de memecoins. Responde em português de Portugal, seco e útil. Nunca dês conselho financeiro. Estrutura: 1) Tese da narrativa (2 frases) 2) Riscos (bullets) 3) O que precisava de ser verdade para isto não ser lixo. Sem emojis.",
          },
          {
            role: "user",
            content: `Token: ${data.name} (${data.symbol})
Idade: ${data.age}
Mcap USD: ${data.marketCap}
Descrição: ${data.description || "(sem)"}
Social: ${data.socials || "(sem)"}
Flags: ${data.flags || "(nenhuma)"}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: `Falha na leitura (${res.status})` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "Resposta vazia" };
    return { ok: true as const, text };
  });

export const aiAvailable = createServerFn({ method: "GET" }).handler(
  async () => ({ available: Boolean(process.env.XAI_API_KEY) }),
);

