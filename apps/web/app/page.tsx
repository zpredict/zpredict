import Hero from "@/components/home/Hero";
import HomeScreen from "@/components/home/HomeScreen";

// Hero is a server component: the ASCII snapshot is computed at build time and Three.js only
// ships in the lazy chunk AsciiLive imports.
export default function Home() {
	return (
		<main>
			<Hero />
			<HomeScreen />
		</main>
	);
}
