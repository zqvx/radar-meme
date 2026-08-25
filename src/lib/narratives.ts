const TAGS: { tag: string; re: RegExp }[] = [
  { tag: "AI", re: /\b(ai|gpt|grok|claude|openai|llm|agent|neural)\b/i },
  { tag: "Elon", re: /\b(elon|musk|doge|x\.com|tesla)\b/i },
  { tag: "Política", re: /\b(trump|maga|biden|election|vote|midterm)\b/i },
  { tag: "Animal", re: /\b(pepe|wojak|doge|shib|cat|kitten|dog|frog|penguin|whale)\b/i },
  { tag: "Cultura", re: /\b(anime|manga|waifu|neko|cosplay)\b/i },
  { tag: "Pump", re: /\b(pump|bonk|moon|rocket)\b/i },
  { tag: "RWA", re: /\b(rwa|treasury|gold|commodity)\b/i },
  { tag: "Gaming", re: /\b(game|play|steam|pixel|quest)\b/i },
];

export function detectNarrative(
  name: string,
  symbol: string,
  description?: string,
): string | undefined {
  const hay = `${name} ${symbol} ${description ?? ""}`;
  for (const { tag, re } of TAGS) {
    if (re.test(hay)) return tag;
  }
  return undefined;
}
