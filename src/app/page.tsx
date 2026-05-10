import Image from "next/image";
import { auth, signIn, signOut } from "@/lib/auth";
import { CreateGameButton } from "@/components/CreateGameButton";
import { JoinGameForm } from "@/components/JoinGameForm";

const ALLOWED_HOSTS = ["lauchgruen", "vexi_fy"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const canHost = ALLOWED_HOSTS.includes(session?.user?.twitchLogin ?? "");
  const errorMessage =
    sp.error === "game_not_found"
      ? `Spiel ${sp.code ? `"${sp.code}"` : ""} existiert nicht oder wurde beendet.`
      : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 text-emerald-50 px-6">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 py-16">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/bear-logo.png"
            alt="QuizDuell Bear"
            width={140}
            height={140}
            className="drop-shadow-2xl"
            priority
          />
          <h1 className="text-5xl font-extrabold tracking-tight text-amber-300 drop-shadow-lg">
            QUIZ<span className="text-emerald-200">DUELL</span> 🍯
          </h1>
        </div>
        <p className="text-emerald-200/80 text-center">
          Eine Echtzeit-Gameshow im Jeopardy-Stil für mehrere Streamer.
        </p>

        {errorMessage ? (
          <div className="w-full bg-red-950/60 border border-red-700 text-red-200 rounded-lg px-4 py-3 text-sm">
            ⚠ {errorMessage}
          </div>
        ) : null}

        {session?.user ? (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex items-center gap-4 bg-emerald-950/60 border border-emerald-800 rounded-xl px-4 py-3">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  width={48}
                  height={48}
                  className="rounded-full border-2 border-amber-400"
                />
              )}
              <div>
                <div className="font-bold text-amber-100">
                  {session.user.name}
                </div>
                <div className="text-sm text-emerald-300/70">
                  @{session.user.twitchLogin}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              {canHost ? <CreateGameButton /> : null}
              <JoinGameForm />
            </div>

            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="text-sm text-emerald-400/70 hover:text-amber-300 underline transition-colors"
              >
                Abmelden
              </button>
            </form>
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("twitch", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-full bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 transition-all px-8 py-4 font-extrabold text-emerald-950 text-lg shadow-lg shadow-amber-400/30"
            >
              Mit Twitch anmelden
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
