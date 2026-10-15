export function safeRedirect(from: string | null | undefined, fallback = "/"): string {
  if (!from) return fallback;
  if (!from.startsWith("/")) return fallback;
  if (from.startsWith("//") || from.startsWith("/\\")) return fallback;
  return from;
}
