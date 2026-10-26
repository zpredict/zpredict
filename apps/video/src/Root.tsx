import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import { Composition } from "remotion";
import { SHOTS, VIDEO } from "./config";
import { Demo } from "./Demo";

const frames = SHOTS.reduce((n, s) => n + Math.round(s.dur * VIDEO.fps), 0);

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
