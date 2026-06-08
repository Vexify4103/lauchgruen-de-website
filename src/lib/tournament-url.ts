export const TOURNAMENT_HOSTS = new Set([
  "tournament.lauchgruen.de",
  "tournament.lauchgruen.localhost",
]);

export function isTournamentHost(host?: string | null): boolean {
  const hostname = (host ?? "").split(":")[0]?.toLowerCase();
  return TOURNAMENT_HOSTS.has(hostname);
}

export function cleanTournamentHref(href: string, cleanUrls: boolean): string {
  if (!cleanUrls) return href;

  if (href === "/tournament") return "/";
  if (href.startsWith("/tournament/")) return href.slice("/tournament".length);
  if (href.startsWith("/tournament?") || href.startsWith("/tournament#")) {
    return `/${href.slice("/tournament".length)}`;
  }

  return href;
}
