import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteUrls } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

export default async function OverlayAccountPage() {
	const requestHeaders = await headers();
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	const apexUrl = getSiteUrls(host).apex;
	redirect(`${apexUrl}/me?from=overlay#streamer-overlay`);
}
