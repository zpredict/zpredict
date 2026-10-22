import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://zpredict.site",
	devToolbar: { enabled: false },
	// One page: inline its CSS so first paint needs no second round trip. The CSP allows it by hash.
	build: { inlineStylesheets: "always" },
	// A parent's scope class rides on the `class` prop it passes to a child component,
	// so sections can position shared UI pieces (Tag, Ring, Button) from their own styles.
	scopedStyleStrategy: "class",
});
