/** Shown to players without a full team: the Win Challenge is duo only. */
export function NeedsPartnerNotice({ className = "" }: { className?: string }) {
	return (
		<p className={`rounded-lg border border-[var(--amber)] px-3 py-2 text-sm leading-6 text-[var(--amber)] ${className}`}>
			Die Win Challenge ist ein Duo-Event. Ohne Partner kannst du nicht mitspielen. Such dir einen Partner und gib ihm euren Team-Code, oder frag im Discord nach. Vor dem
			Start versucht die Orga, übrige Einzelspieler zusammenzubringen.
		</p>
	);
}
