/** Accepts only same-origin relative paths to avoid open redirects after login. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/auth/") || value.startsWith("/login")) return fallback;
  return value;
}
