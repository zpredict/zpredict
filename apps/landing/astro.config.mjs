import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://zpredict.site",
	devToolbar: { enabled: false },
	// A parent's scope class rides on the `class` prop it passes to a child component,
	// so sections can position shared UI pieces (Tag, Ring, Button) from their own styles.
	scopedStyleStrategy: "class",
});
