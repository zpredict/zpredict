import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import { Composition } from "remotion";
import { cutProblems, SHOTS, shotDur, VIDEO } from "./config";
import { Demo } from "./Demo";

const problems = cutProblems();
if (problems.length) throw new Error(`The cut is out of sync:\n${problems.join("\n")}`);

const frames = SHOTS.reduce((n, s, i) => n + Math.round(shotDur(s, i) * VIDEO.fps), 0);

export function Root() {
	return (
		<Composition
			component={Demo}
			durationInFrames={frames}
			fps={VIDEO.fps}
			height={VIDEO.height}
			id="Demo"
			width={VIDEO.width}
		/>
	);
}
