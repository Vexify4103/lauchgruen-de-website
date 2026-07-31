export function RiotDisclaimer({ productName, className = "" }: { productName: string; className?: string }) {
	return (
		<p lang="en" className={className}>
			{productName}{" "}isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
		</p>
	);
}
