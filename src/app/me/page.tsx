import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteUrls } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

export default async function AccountRedirectPage() {
	const requestHeaders = await headers();
	const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	redirect(`${getSiteUrls(host).apex}/me`);
}
