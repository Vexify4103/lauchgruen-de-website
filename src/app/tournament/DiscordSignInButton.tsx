"use client";

import { signIn } from "next-auth/react";
import { useState, type ReactNode } from "react";

export function DiscordSignInButton({
	redirectTo,
	children,
	className,
	pendingLabel,
	ariaLabel,
	title,
}: {
	redirectTo: string;
	children: ReactNode;
	className?: string;
	pendingLabel?: string;
	ariaLabel?: string;
	title?: string;
}) {
	const [pending, setPending] = useState(false);

	async function startSignIn() {
		if (pending) return;
		setPending(true);
		try {
			await signIn("discord", { redirectTo });
		} catch {
			setPending(false);
		}
	}

	return (
		<button
			type="button"
			onClick={startSignIn}
			disabled={pending}
			aria-busy={pending}
			aria-label={ariaLabel}
			title={title}
			className={className}
		>
			{pending && pendingLabel ? pendingLabel : children}
		</button>
	);
}
