import { THREATS } from "@/content/threat-model";

export default function ThreatTable() {
	return (
		<section aria-label="Threat model" className="ttable">
			<table>
				<thead>
					<tr>
						<th scope="col">Observer</th>
						<th scope="col">Learns</th>
						<th scope="col">Doesn&apos;t learn</th>
					</tr>
				</thead>
				<tbody>
					{THREATS.map((t) => (
						<tr key={t.observer}>
							<th scope="row">{t.observer}</th>
							<td>{t.learns}</td>
							<td>{t.not}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
