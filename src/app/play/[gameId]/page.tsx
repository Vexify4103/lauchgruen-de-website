import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { GameClient } from "@/components/GameClient";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const { gameId } = await params;
  return <GameClient gameId={gameId} userId={session.user.id} mode="play" />;
}
