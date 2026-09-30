"use client";

import { useEffect, useState } from "react";
import { LoadingIndicator, LoadingOrb } from "@/components/LoadingIndicator";
import { TwitchClipCard, type TwitchClipCardData } from "@/components/TwitchClipCard";

type Sort = "views" | "date";
type Period = "30d" | "all";

interface ClipsResponse {
	clips: TwitchClipCardData[];
	total: number;
	hasMore: boolean;
}

const PAGE_SIZE = 18;

export function ClipsArchive() {
	const [sort, setSort] = useState<Sort>("views");
	const [period, setPeriod] = useState<Period>("all");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [data, setData] = useState<ClipsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const controller = new AbortController();
		fetch(`/api/twitch/clips?login=lauchgruen&period=${period}&sort=${sort}&count=${limit}`, {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return (await response.json()) as ClipsResponse;
			})
			.then(setData)
			.catch((reason: unknown) => {
				if (reason instanceof DOMException && reason.name === "AbortError") return;
				setError("Die Clips konnten gerade nicht von Twitch geladen werden.");
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [limit, period, sort]);

	function changeFilter(nextPeriod: Period, nextSort: Sort) {
		if (nextPeriod === period && nextSort === sort) return;
		setLoading(true);
		setError("");
		setPeriod(nextPeriod);
		setSort(nextSort);
		setLimit(PAGE_SIZE);
	}

	function loadMore() {
		setLoading(true);
		setError("");
		setLimit((current) => current + PAGE_SIZE);
	}

	return (
		<div>
			<div className="clip-toolbar">
				<div>
					<div className="panel-kicker">Clip-Archiv</div>
					<div className="mt-2 text-sm text-[var(--muted)]">
						{data ? `${data.total.toLocaleString("de-DE")} Twitch-Momente gefunden` : "Twitch-Momente werden gesammelt"}
					</div>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row" aria-label="Clips filtern">
					<div className="flex rounded-xl border border-white/9 bg-white/[0.035] p-1">
						<FilterButton active={period === "30d"} onClick={() => changeFilter("30d", sort)}>
							30 Tage
						</FilterButton>
						<FilterButton active={period === "all"} onClick={() => changeFilter("all", sort)}>
							Alle
						</FilterButton>
					</div>
					<div className="flex rounded-xl border border-white/9 bg-white/[0.035] p-1">
						<FilterButton active={sort === "views"} onClick={() => changeFilter(period, "views")}>
							Beliebt
						</FilterButton>
						<FilterButton active={sort === "date"} onClick={() => changeFilter(period, "date")}>
							Neu
						</FilterButton>
					</div>
				</div>
			</div>

			{error ? (
				<div role="alert" className="mt-6 rounded-[1.7rem] border border-rose-200/16 bg-rose-300/[0.07] p-6 text-sm font-bold text-rose-100">
					{error}
				</div>
			) : null}

			{loading ? <LoadingIndicator label="Clips werden geladen…" state="searching" compact className="mt-5" /> : null}
			{loading && !data ? (
				<div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<ClipSkeleton key={index} />
					))}
				</div>
			) : data?.clips.length ? (
				<>
					<div className={`mt-7 grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-55" : "opacity-100"}`}>
						{data.clips.map((clip) => (
							<TwitchClipCard key={clip.id} clip={clip} />
						))}
					</div>
					{data.hasMore ? (
						<div className="mt-8 flex justify-center">
							<button type="button" disabled={loading} onClick={loadMore} className="button primary">
								{loading ? (
									<>
										<LoadingOrb state="searching" /> Wird geladen…
									</>
								) : (
									"Mehr Clips zeigen"
								)}
							</button>
						</div>
					) : null}
				</>
			) : !loading && !error ? (
				<div className="empty-state mt-7">
					<span aria-hidden="true">✦</span>
					<h2 className="mt-4 text-2xl font-black">Noch keine Clips gefunden.</h2>
					<p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-emerald-100/55">
						Sobald auf Twitch ein Highlight entsteht, landet es automatisch in dieser Sammlung.
					</p>
				</div>
			) : null}
		</div>
	);
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button type="button" aria-pressed={active} onClick={onClick} className="clip-filter">
			{children}
		</button>
	);
}

function ClipSkeleton() {
	return (
		<div aria-hidden="true" className="clip-card motion-safe:animate-pulse overflow-hidden">
			<div className="aspect-video bg-emerald-900/30" />
			<div className="space-y-3 p-5">
				<div className="h-4 w-4/5 rounded-full bg-emerald-900/35" />
				<div className="h-3 w-1/2 rounded-full bg-emerald-900/25" />
			</div>
		</div>
	);
}
