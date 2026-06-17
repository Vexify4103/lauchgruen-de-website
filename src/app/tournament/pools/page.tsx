import { getChampionPools } from "@/lib/champion-pools";
import { PoolBrowser } from "./PoolBrowser";

export const dynamic = "force-dynamic";

export default async function TournamentPoolsPage() {
	const pools = await getChampionPools();
	const championCount = pools.reduce((sum, pool) => sum + pool.champions.length, 0);

	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="max-w-3xl">
						<div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">A-Z Champion-Pools</div>
						<h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">Welche Champions sind in welchem Pool?</h1>
						<p className="mt-4 text-sm leading-7 text-emerald-100/68">
							Die Liste kommt direkt aus Riot Data Dragon und braucht keinen Riot API-Key. Beim Wheel-Spin bekommt jedes Team einen dieser Pools und darf in dem Match
							nur Champions aus diesem Pool spielen.
						</p>
					</div>
					<div className="rounded-2xl border border-lime-200/16 bg-lime-200/10 px-4 py-3 text-sm font-black text-lime-50">
						{championCount} Champions · {pools.length} Pools
					</div>
				</div>

				<div className="mt-8 grid gap-4 rounded-[2rem] border border-lime-200/14 bg-lime-200/[0.055] p-5 shadow-xl shadow-black/20 md:grid-cols-4">
					{[
						{
							title: "1. Pro Match",
							text: "Das Wheel wird für ein konkretes Match gedreht. Team A und Team B bekommen jeweils einen eigenen Pool.",
						},
						{
							title: "2. Nur dieser Pool",
							text: "In diesem Match darf das Team nur Champions aus dem gezogenen Pool spielen.",
						},
						{
							title: "3. Danach raus",
							text: "Wenn das Match als Finished gespeichert wird, gilt der Pool als gespielt und verlässt das Team-Wheel.",
						},
						{
							title: "4. Playoff-Reset",
							text: "Zum zweiten Spieltag / Playoff-Tag werden die Pools wieder refreshed.",
						},
					].map((item) => (
						<div key={item.title} className="rounded-2xl border border-white/10 bg-black/18 p-4">
							<div className="text-xs font-black uppercase tracking-[0.2em] text-lime-200/70">{item.title}</div>
							<p className="mt-2 text-sm leading-6 text-emerald-100/64">{item.text}</p>
						</div>
					))}
				</div>

				<PoolBrowser pools={pools} />
			</section>
		</div>
	);
}
