/** Small fetch helper for the Win Challenge client pages. Throws the German message from the API. */
export async function winFetch<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
	const response = await fetch(url, {
		method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
		headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
		body: init?.body === undefined ? undefined : JSON.stringify(init.body),
		cache: "no-store",
	});
	const data = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
	if (!response.ok) throw new Error(data?.message ?? `Fehler ${response.status}`);
	return data as T;
}

export function formatDateTime(iso: string | undefined | null): string {
	if (!iso) return "–";
	return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));
}

/** `datetime-local` value in Berlin time for an ISO string. */
export function toLocalInput(iso: string | undefined): string {
	if (!iso) return "";
	const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
	return parts.replace(" ", "T");
}

/** ISO string for a `datetime-local` value entered in Berlin time. */
export function fromLocalInput(value: string): string {
	const asUtc = new Date(`${value}:00Z`);
	const berlin = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
	const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
	return new Date(asUtc.getTime() - (berlin.getTime() - utc.getTime())).toISOString();
}
