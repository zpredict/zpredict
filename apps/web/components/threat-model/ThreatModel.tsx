import Pane from "@/components/ui/Pane";
import ScrambleHeading from "@/components/ui/ScrambleHeading";
import { LEAK_CHECKLIST, MOCKS, SPLIT_STATEMENT } from "@/content/threat-model";
import BulletCard from "./BulletCard";
import ThreatTable from "./ThreatTable";

/** The template's "Common questions" layout: a lime section for the table, paper for the lists. */
export default function ThreatModel() {
	return (
		<>
			<Pane aria-labelledby="tm-title" className="tm tm--lime" variant="lime">
				<div className="tm__side">
					<p className="tm__eyebrow">Threat model</p>
					<ScrambleHeading
						as="h1"
						className="tm__title"
						id="tm-title"
						lines={["Who learns", "what."]}
					/>
					<p className="tm__statement">{SPLIT_STATEMENT}</p>
				</div>
				<ThreatTable />
			</Pane>
			<Pane aria-label="Checklists" className="tm tm--paper" variant="paper">
				<BulletCard items={LEAK_CHECKLIST} title="Leak checklist." />
				<BulletCard items={MOCKS} title="What is mocked in this build." />
			</Pane>
		</>
	);
}
