import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createGame, registerQuestionPool } from "@/server/game-state";
import { loadQuestionPool, pickCategoriesAndBoard } from "@/lib/questions";

let questionPoolRegistered = false;
function ensureQuestionPool(): void {
  if (questionPoolRegistered) return;
  registerQuestionPool(loadQuestionPool());
  questionPoolRegistered = true;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  ensureQuestionPool();
  const { categories, board } = pickCategoriesAndBoard(6);
  const game = createGame({
    hostId: session.user.id,
    categories,
    board,
  });
  return NextResponse.json({ gameId: game.id });
}
