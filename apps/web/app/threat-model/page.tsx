import type { Metadata } from "next";
import ThreatModel from "@/components/threat-model/ThreatModel";

export const metadata: Metadata = { title: "Threat model" };

export default function ThreatModelPage() {
	return (
		<main>
			<ThreatModel />
		</main>
	);
}
