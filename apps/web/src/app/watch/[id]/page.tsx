import { getScenario, listScenarios } from "@alpenchaos/scenarios";
import { notFound } from "next/navigation";
import { WatchView } from "../../../components/WatchView";

export const dynamicParams = false;

export function generateStaticParams() {
  return listScenarios().map((s) => ({ id: s.id }));
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = getScenario(id);
  if (!scenario) notFound();
  return <WatchView scenario={scenario} />;
}
