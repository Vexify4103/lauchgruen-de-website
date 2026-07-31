import type { Metadata } from "next";
import { NotFoundRedirect } from "@/components/NotFoundRedirect";

export const metadata: Metadata = {
	title: "Seite nicht gefunden",
	robots: { index: false, follow: false },
};

export default function NotFound() {
	return <NotFoundRedirect />;
}
