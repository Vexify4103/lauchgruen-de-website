import Image from "next/image";
import { auth, signIn, signOut } from "@/lib/auth";
import { CreateGameButton } from "@/components/CreateGameButton";
import { JoinGameForm } from "@/components/JoinGameForm";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-50 px-6">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 py-16">
        <h1 className="text-4xl font-bold tracking-tight">QuizDuell</h1>
        <p className="text-zinc-400 text-center">
          A real-time, multi-streamer Jeopardy-style gameshow.
        </p>

        {session?.user ? (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex items-center gap-4">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  width={48}
                  height={48}
                  className="rounded-full"
                />
              )}
              <div>
                <div className="font-semibold">{session.user.name}</div>
                <div className="text-sm text-zinc-400">@{session.user.twitchLogin}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <CreateGameButton />
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
                className="text-sm text-zinc-500 hover:text-zinc-300 underline"
              >
                Sign out
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
              className="rounded-full bg-purple-600 hover:bg-purple-500 transition-colors px-6 py-3 font-semibold"
            >
              Sign in with Twitch
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
