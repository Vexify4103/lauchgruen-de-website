"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { ChampionPool } from "@/lib/champion-pools";

export function PoolBrowser({ pools }: { pools: ChampionPool[] }) {
	const [selectedPool, setSelectedPool] = useState("all");
	const visiblePools = useMemo(() => (selectedPool === "all" ? pools : pools.filter((pool) => pool.pool === selectedPool)), [pools, selectedPool]);

	return (
		<div className="mt-8 grid gap-5">
			<div className="sticky top-24 z-20 rounded-[1.5rem] border border-white/10 bg-[#07110c]/88 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={() => setSelectedPool("all")} className={filterClass(selectedPool === "all")}>
						Alle
					</button>
					{pools.map((pool) => (
						<button
							key={pool.pool}
							type="button"
							onClick={() => setSelectedPool(pool.pool)}
							className={filterClass(selectedPool === pool.pool)}
							title={`${pool.champions.length} Champions`}
						>
							{pool.label}
						</button>
					))}
				</div>
			</div>

			<div className="grid gap-4">
				{visiblePools.map((pool, index) => (
					<article key={pool.pool} className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.04] shadow-xl shadow-black/18">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-black/18 px-4 py-3">
							<div>
								<div className="text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/54">
									Pool {String(pools.findIndex((entry) => entry.pool === pool.pool) + 1 || index + 1).padStart(2, "0")}
								</div>
								<h2 className="mt-1 text-2xl font-black text-emerald-50">{pool.label}</h2>
							</div>
							<div className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/60">
								{pool.champions.length} Champions
							</div>
						</div>

						{pool.champions.length === 0 ? (
							<p className="p-5 text-sm italic text-emerald-100/44">Champions konnten gerade nicht geladen werden.</p>
						) : (
							<div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
								{pool.champions.map((champion) => (
									<div
										key={champion.id}
										className="group min-w-0 overflow-hidden rounded-xl border border-white/8 bg-black/22 p-1.5 transition hover:-translate-y-0.5 hover:border-lime-200/30 hover:bg-lime-200/8"
										title={`${champion.name} - ${champion.title}`}
									>
										<div className="relative aspect-square overflow-hidden rounded-lg bg-emerald-950">
											<Image
												src={champion.imageUrl}
												alt={champion.name}
												fill
												sizes="7rem"
												className="object-cover transition duration-300 group-hover:scale-105"
											/>
										</div>
										<div className="mt-1 truncate text-center text-[11px] font-black text-emerald-50">{champion.name}</div>
									</div>
								))}
							</div>
						)}
					</article>
				))}
			</div>
		</div>
	);
}

function filterClass(active: boolean) {
	return `rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
		active ? "border-lime-200/40 bg-lime-200/14 text-lime-50" : "border-white/10 bg-black/22 text-emerald-100/58 hover:border-lime-200/26 hover:text-lime-100"
	}`;
}
