"use client";

import { signIn } from "next-auth/react";
import { LoadingOrb } from "@/components/LoadingIndicator";
import { useState, type ReactNode } from "react";
import { discordSignInReturnUrl } from "@/lib/discord-sign-in-return";

export function DiscordSignInButton({
	redirectTo,
	children,
	className,
	pendingLabel,
	ariaLabel,
	title,
	returnToCurrentPage = false,
}: {
	redirectTo: string;
	children: ReactNode;
	className?: string;
	pendingLabel?: string;
	ariaLabel?: string;
	title?: string;
	returnToCurrentPage?: boolean;
}) {
	const [pending, setPending] = useState(false);

	async function startSignIn() {
		if (pending) return;
		setPending(true);
		try {
			const returnUrl = returnToCurrentPage ? window.location.href : discordSignInReturnUrl(redirectTo, window.location.href);
			await signIn("discord", { redirectTo: returnUrl });
		} catch {
			setPending(false);
		}
	}

	return (
		<button type="button" onClick={startSignIn} disabled={pending} aria-busy={pending} aria-label={ariaLabel} title={title} className={className}>
			{pending ? (
				<span role="status" className="inline-flex items-center gap-2">
					<LoadingOrb state="connecting" />
					{pendingLabel ?? "Weiter zu Discord…"}
				</span>
			) : (
				children
			)}
		</button>
	);
}
