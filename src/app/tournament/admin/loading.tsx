export default function TournamentAdminLoading() {
	return (
		<div className="px-5 py-10 sm:py-14">
			<section className="mx-auto w-full max-w-7xl">
				<div className="rounded-[2.2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/25">
					<div className="h-3 w-40 rounded-full bg-lime-200/20" />
					<div className="mt-5 h-10 w-full max-w-xl rounded-2xl bg-emerald-100/10" />
					<div className="mt-4 h-4 w-full max-w-2xl rounded-full bg-emerald-100/8" />
				</div>
				<div className="mt-6 grid gap-5 xl:grid-cols-2">
					{Array.from({ length: 4 }).map((_, index) => (
						<div key={index} className="min-h-48 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
							<div className="h-3 w-32 rounded-full bg-lime-200/18" />
							<div className="mt-5 h-8 w-56 rounded-xl bg-emerald-100/10" />
							<div className="mt-6 grid gap-3 sm:grid-cols-2">
								<div className="h-20 rounded-2xl bg-black/20" />
								<div className="h-20 rounded-2xl bg-black/20" />
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
