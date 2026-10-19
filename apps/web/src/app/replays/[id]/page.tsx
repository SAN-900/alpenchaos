import { ReplayView } from "../../../components/ReplayView";

export const metadata = {
  title: "Match Replay · AlpenChaos",
  description: "Review the outcome and action log of an AlpenChaos multiplayer match.",
};

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayView matchId={id} />;
}
