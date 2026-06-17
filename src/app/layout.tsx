import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Lauchgruen",
	description: "Streams, Community-Events und Turniere auf lauchgruen.de",
	icons: { icon: "/bear-logo.png", apple: "/bear-logo.png" },
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
