"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function AccountLogoutButton({
	returnUrl,
	label = "Discord abmelden",
	pendingLabel = "Wird abgemeldet …",
	className,
}: {
	returnUrl: string;
	label?: string;
	pendingLabel?: string;
	className?: string;
}) {
	const [pending, setPending] = useState(false);

	async function logout() {
		if (pending) return;
		setPending(true);
		try {
			await signOut({ redirect: false });
			window.location.assign(returnUrl);
		} catch {
			setPending(false);
		}
	}

	return (
		<button
			type="button"
			onClick={logout}
			disabled={pending}
			aria-busy={pending}
			className={className ?? "rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-100/74 transition hover:border-red-200/30 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-wait disabled:opacity-55"}
		>
			{pending ? pendingLabel : label}
		</button>
	);
}
