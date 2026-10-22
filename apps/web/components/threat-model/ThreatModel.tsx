import Pane from "@/components/ui/Pane";
import { LEAK_CHECKLIST, MOCKS, SPLIT_STATEMENT } from "@/content/threat-model";
import BulletCard from "./BulletCard";
import ThreatTable from "./ThreatTable";

export default function ThreatModel() {
	return (
		<Pane className="tm">
			<p className="tm__eyebrow">Threat model</p>
			<h1 className="tm__title">
				Who learns
				<br />
				what
			</h1>
			<p className="tm__statement">{SPLIT_STATEMENT}</p>
			<ThreatTable />
			<div className="tm__cards">
				<BulletCard items={LEAK_CHECKLIST} title="Leak checklist" />
				<BulletCard items={MOCKS} title="What is mocked in this build" />
			</div>
		</Pane>
	);
}
