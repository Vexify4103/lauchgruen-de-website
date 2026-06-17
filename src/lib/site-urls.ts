const productionUrls = {
	apex: "https://lauchgruen.de",
	quiz: "https://quiz.lauchgruen.de",
	tournament: "https://tournament.lauchgruen.de",
};

export type SiteUrls = typeof productionUrls;

export function getSiteUrls(host?: string | null): SiteUrls {
	const normalizedHost = (host ?? "").toLowerCase();
	const [hostname, maybePort] = normalizedHost.split(":");
	const port = maybePort ? `:${maybePort}` : "";
	const quizUrl = process.env.NEXT_PUBLIC_QUIZ_URL ?? productionUrls.quiz;

	if (hostname.endsWith(".localhost") || hostname === "localhost") {
		return {
			apex: `http://lauchgruen.localhost${port}`,
			quiz: process.env.NEXT_PUBLIC_QUIZ_URL ?? `http://quiz.lauchgruen.localhost${port}`,
			tournament: `http://tournament.lauchgruen.localhost${port}`,
		};
	}

	return {
		...productionUrls,
		quiz: quizUrl,
	};
}
