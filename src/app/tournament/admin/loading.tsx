export default function TournamentAdminLoading() {
	return (
		<div className="relative overflow-hidden px-5 py-8 sm:py-10">
			<section className="mx-auto w-full max-w-[96rem] animate-pulse">
				<div className="overflow-hidden rounded-[2.4rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/25">
					<div className="grid gap-7 p-8 lg:grid-cols-[1fr_18rem]">
						<div>
							<div className="h-3 w-40 rounded-full bg-lime-200/18" />
							<div className="mt-5 h-14 max-w-xl rounded-2xl bg-emerald-100/10" />
							<div className="mt-4 h-4 max-w-2xl rounded-full bg-emerald-100/8" />
						</div>
						<div className="grid grid-cols-2 gap-2">
							{Array.from({ length: 4 }).map((_, index) => (
								<div key={index} className="h-14 rounded-2xl bg-black/22" />
							))}
						</div>
					</div>
					<div className="grid border-t border-white/8 sm:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<div key={index} className="h-20 border-r border-white/8 bg-black/12 last:border-r-0" />
						))}
					</div>
				</div>
				<div className="mt-8 h-8 w-56 rounded-xl bg-emerald-100/8" />
				<div className="mt-4 min-h-[32rem] rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
					<div className="h-10 w-64 rounded-xl bg-emerald-100/10" />
					<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{Array.from({ length: 8 }).map((_, index) => (
							<div key={index} className="h-24 rounded-2xl bg-black/20" />
						))}
					</div>
				</div>
				<div className="mt-5 grid gap-5 xl:grid-cols-[1fr_22rem]">
					<div className="h-56 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
					<div className="h-56 rounded-[2rem] border border-white/10 bg-white/[0.04]" />
				</div>
			</section>
		</div>
	);
}
