import { azChallengeResponse } from "@/lib/az-challenge-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	return azChallengeResponse("spaceffs", request);
}
