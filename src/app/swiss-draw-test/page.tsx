import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalSwissSandbox } from "@/lib/swiss-pot-sandbox";
import { SwissPotSimulator } from "./SwissPotSimulator";

export const metadata = { title: "Swiss-Topfziehung · Lokaler Test", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function SwissDrawTestPage() {
	if (!isLocalSwissSandbox((await headers()).get("host"))) notFound();
	return <SwissPotSimulator />;
}
