import { createFileRoute } from "@tanstack/react-router";
import { QuorumApp } from "@/components/weather/QuorumApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <QuorumApp />;
}
