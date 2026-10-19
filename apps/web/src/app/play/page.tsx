import { LocalGame } from "../../components/LocalGame";

export const metadata = {
  title: "Local Game · AlpenChaos",
  description: "Play a local deterministic Solana consensus match against a bot opponent.",
};

export default function PlayPage() {
  return <LocalGame />;
}
