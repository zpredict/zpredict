import AsciiHero from "@/components/hero/AsciiHero";
import HomeScreen from "@/components/home/HomeScreen";

// AsciiHero is a server component: the ASCII snapshot is computed at build time (the LCP) and
// Three.js only ships in the lazy chunk AsciiLive imports. It is the featured card's visual.
export default function Home() {
	return (
		<main className="home">
			<HomeScreen visual={<AsciiHero />} />
		</main>
	);
}
