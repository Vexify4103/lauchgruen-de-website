import { DraftViewerPage } from "../DraftViewerPage";

export default async function BlueDraftViewerPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <DraftViewerPage id={id} perspective="blue" />;
}
