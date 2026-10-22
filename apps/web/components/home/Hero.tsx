import AsciiHero from "@/components/hero/AsciiHero";
import JudgeCta from "@/components/judge/JudgeCta";
import ScrambleHeading from "@/components/ui/ScrambleHeading";

const LINES = [
	"Bet on Zcash.",
	"Without being seen.",
	"No one learns who bet,",
	"which side,",
	"or how much.",
] as const;

/** The ASCII mark with the statement over it as lime highlighter strips. */
export default function Hero() {
	return (
		<section aria-labelledby="hero-title" className="hero">
			<AsciiHero />
			<div className="hero__copy">
				<p className="hero__eyebrow">Zcash · shielded prediction markets</p>
				<ScrambleHeading as="h1" className="hero__title" id="hero-title" lines={LINES} />
				<JudgeCta />
			</div>
		</section>
	);
}
