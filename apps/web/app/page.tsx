import HeroPane from "@/components/home/HeroPane";
import ShowcasePane from "@/components/home/ShowcasePane";

export default function Home() {
	return (
		<main className="panel split">
			<HeroPane />
			<ShowcasePane />
		</main>
	);
}
