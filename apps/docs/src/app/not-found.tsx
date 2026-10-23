import Link from "next/link";

export const metadata = { title: "Page not found" };

const NotFound = () => (
	<main className="docs-404">
		<h1>404</h1>
		<p>This page could not be found.</p>
		<Link className="docs-btn" href="/docs/introduction">
			Go to the docs
		</Link>
	</main>
);

export default NotFound;
