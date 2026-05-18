import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "lauchgruen",
  description:
    "Streams, Community-Events und Quizshow-Abende auf lauchgruen.de.",
};

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
