import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ADDR_RE =
  /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

export function isValidAddress(value: string): boolean {
  return ADDR_RE.test(value.trim());
}

export function shortAddress(value: string, size = 4): string {
  const v = value.trim();
  if (v.length <= size * 2 + 3) return v;
  return `${v.slice(0, size + (v.startsWith("0x") ? 2 : 0))}…${v.slice(-size)}`;
}
