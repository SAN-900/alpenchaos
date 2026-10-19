import { ReplayArchive } from "../../components/ReplayArchive";

export const metadata = {
  title: "Replay Archive · AlpenChaos",
  description: "Browse completed AlpenChaos matches and replay their deterministic action logs.",
};

export default function ReplaysPage() {
  return <ReplayArchive />;
}
