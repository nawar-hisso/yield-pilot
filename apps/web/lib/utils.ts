import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function short(addr: string | undefined | null, left = 6, right = 4) {
  if (!addr) return "";
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}
