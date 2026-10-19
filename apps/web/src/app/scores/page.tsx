import { dailyScenario, listScenarios } from "@alpenchaos/scenarios";
import { Leaderboard } from "../../components/Leaderboard";

export const metadata = {
  title: "Scores · AlpenChaos",
  description: "Browse multiplayer match scores and replays.",
};

export default function ScoresPage() {
  const scenarios = [...listScenarios(), dailyScenario()]
    .filter((scenario) => scenario.mode === "play")
    .map(({ id, name }) => ({ id, name }));
  return <main className="page scores-page rise"><header className="head"><p className="eyebrow">MATCH ARCHIVE</p><h1>Scores & replays.</h1><p className="tagline">Leaderboard results from completed online matches. Choose a scenario and side to explore top runs.</p></header><Leaderboard scenarios={scenarios} /></main>;
}
