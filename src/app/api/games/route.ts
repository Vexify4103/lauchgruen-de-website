import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createGame, registerQuestionPool } from "@/server/game-state";
import { loadQuestionPool, pickAllBoards } from "@/lib/questions";

let questionPoolRegistered = false;
function ensureQuestionPool(): void {
  if (questionPoolRegistered) return;
  registerQuestionPool(loadQuestionPool());
  questionPoolRegistered = true;
}

const ALLOWED_HOSTS = ["lauchgruen", "vexi_fy"];

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!ALLOWED_HOSTS.includes(session.user.twitchLogin ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  ensureQuestionPool();
  const boards = pickAllBoards(3);
  const game = createGame({
    hostId: session.user.id,
    boards,
  });
  return NextResponse.json({ gameId: game.id });
}
