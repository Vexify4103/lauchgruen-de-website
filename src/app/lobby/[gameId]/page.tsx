import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LobbyClient } from "./LobbyClient";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  const { gameId } = await params;
  return (
    <LobbyClient
      gameId={gameId}
      userId={session.user.id}
      isHost={false /* server doesn't know yet — client will discover from state */}
    />
  );
}
