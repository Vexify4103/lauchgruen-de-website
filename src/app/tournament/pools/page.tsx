import Image from "next/image";
import { getChampionPools } from "@/lib/champion-pools";

export const dynamic = "force-dynamic";

export default async function TournamentPoolsPage() {
  const pools = await getChampionPools();
  const championCount = pools.reduce((sum, pool) => sum + pool.champions.length, 0);

  return (
    <div className="px-5 py-10 sm:py-14">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.3em] text-lime-200/64">
              A-Z Champion-Pools
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
              Welche Champions sind in welchem Pool?
            </h1>
            <p className="mt-4 text-sm leading-7 text-emerald-100/68">
              Die Liste kommt direkt aus Riot Data Dragon und braucht keinen
              Riot API-Key. Beim Wheel-Spin bekommt jedes Team einen dieser
              Pools und darf in dem Match nur Champions aus diesem Pool spielen.
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
              title: "4. Top 3 Reset",
              text: "Ab Top 3 kann die Orga die Pools wieder refreshen, wenn das Format es verlangt.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-black/18 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-lime-200/70">
                {item.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-100/64">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5">
          {pools.map((pool, index) => (
            <article
              key={pool.pool}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-black/18 px-5 py-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-200/54">
                    Pool {String(index + 1).padStart(2, "0")}
                  </div>
                  <h2 className="mt-1 text-3xl font-black text-emerald-50">
                    {pool.label}
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/60">
                  {pool.champions.length} Champions
                </div>
              </div>

              {pool.champions.length === 0 ? (
                <p className="p-5 text-sm italic text-emerald-100/44">
                  Champions konnten gerade nicht geladen werden.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {pool.champions.map((champion) => (
                    <div
                      key={champion.id}
                      className="group overflow-hidden rounded-2xl border border-white/8 bg-black/22 p-2 transition hover:-translate-y-0.5 hover:border-lime-200/30 hover:bg-lime-200/8"
                      title={`${champion.name} - ${champion.title}`}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-xl bg-emerald-950">
                        <Image
                          src={champion.imageUrl}
                          alt={champion.name}
                          fill
                          sizes="(min-width: 1024px) 10rem, (min-width: 640px) 25vw, 50vw"
                          className="object-cover transition duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="mt-2 truncate text-sm font-black text-emerald-50">
                        {champion.name}
                      </div>
                      <div className="truncate text-xs text-emerald-100/44">
                        {champion.title}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
