"use client";
import { useEffect } from "react";

/** Sets the tab title to "<title> | zPredict" for client-routed pages (the static export can't). */
export default function DocumentTitle({ title }: { title: string }) {
	useEffect(() => {
		const previous = document.title;
		document.title = `${title} | zPredict`;
		return () => {
			document.title = previous;
		};
	}, [title]);
	return null;
}
