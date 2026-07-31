import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://lauchgruen.de"),
	title: { default: "Lauchgruen", template: "%s | Lauchgruen" },
	description: "Streams, Community-Events und Turniere auf lauchgruen.de",
	applicationName: "Lauchgruen",
	openGraph: {
		type: "website",
		locale: "de_DE",
		siteName: "Lauchgruen",
		title: "Lauchgruen · Streams, Community und Turniere",
		description: "Streams, Community-Events, League-Turniere und kostenlose OBS-Tools.",
		url: "/",
		images: [{ url: "/bear-logo.png", width: 512, height: 512, alt: "Lauchgruen" }],
	},
	twitter: { card: "summary", title: "Lauchgruen", description: "Streams, Community-Events und Turniere.", images: ["/bear-logo.png"] },
	robots: { index: true, follow: true },
	icons: {
		icon: [{ url: "/bear-logo.png", type: "image/png" }],
		shortcut: "/bear-logo.png",
		apple: "/bear-logo.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="de" className="h-full antialiased">
			<body className="h-full">{children}</body>
		</html>
	);
}
