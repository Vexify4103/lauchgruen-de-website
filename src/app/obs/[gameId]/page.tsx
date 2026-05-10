import { ObsClient } from "./ObsClient";

interface SearchParams {
  hideself?: string;
  nosfx?: string;
  compact?: string;
}

export default async function ObsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { gameId } = await params;
  const sp = await searchParams;
  return (
    <ObsClient
      gameId={gameId}
      hideSelf={sp.hideself}
      compact={sp.compact === "1"}
    />
  );
}
