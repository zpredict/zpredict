/**
 * Live ASCII scene: the extruded zPredict mark on a dotted ground, rendered as glyphs
 * (ASCII Studio spec §7). Pass 1 renders data channels into a render target; pass 2 draws a
 * glyph per cell with flicker, a moving light band and a lime cursor trail.
 *
 * Caps rendering at 30 fps unless the pointer is moving, pauses while the canvas is off-screen
 * or the tab is hidden, hides the canvas on WebGL context loss (and resumes on restore).
 * With reduced motion it draws one still frame: no flicker, light, rotation, parallax or trail.
 */
import {
	Camera,
	CanvasTexture,
	DoubleSide,
	ExtrudeGeometry,
	LinearFilter,
	Mesh,
	NearestFilter,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	ShaderMaterial,
	Shape,
	Vector2,
	Vector3,
	Vector4,
	WebGLRenderer,
	WebGLRenderTarget,
} from "three";
import { ALPHABET, CONTRAST, drawAtlas, GLYPH_SPEED } from "./glyphs.js";
import { markPaths } from "./mark.js";
import {
	groundFragment,
	MAX_TRAIL,
	markFragment,
	postFragment,
	postVertex,
	worldVertex,
} from "./shaders.js";
import {
	BASE_YAW,
	CELL,
	DEFAULT_FRAMING,
	designScale,
	ELEVATION,
	type Framing,
	frustum,
	MARK_BEVEL,
	MARK_DEPTH,
	MARK_SCALE,
} from "./view.js";

export interface AsciiSceneOptions {
	/** Where the mark sits in the canvas. Default `{ size: 0.7, x: 0.5, y: 0.55 }`. */
	framing?: Framing;
	/** Glyph cell width in design px (height is 1.5×). Default 6.8. */
	cell?: number;
	/**
	 * Floor for the glyph width in CSS px at ≤ 900 px wide. The template's rule (6.8 design px on a
	 * 900 px logical width) leaves ~3 px glyphs on a phone, which read as grey texture rather than
	 * characters. Default 0: the template's behaviour.
	 */
	mobileCellPx?: number;
	/** Default: the `prefers-reduced-motion` media query. */
	reducedMotion?: boolean;
	/** Hex colours. Defaults: glyph `#8f8f8f`, trail `#d2fc52`, background `#050505`. */
	colors?: { glyph?: string; trail?: string; background?: string };
}

export interface AsciiScene {
	/** Resolves after the first frame is on the canvas; rejects if shaders fail to compile. */
	ready: Promise<void>;
	/** Moves the mark (e.g. when a media query changes the layout). */
	setFraming(framing: Framing): void;
	dispose(): void;
}

/** Hex colour to linear RGB. */
const linear = (hex: string) => {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	const f = (v: number) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return new Vector3(f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255));
};

function glyphTexture(chars: string): CanvasTexture {
	const ctx = document.createElement("canvas").getContext("2d");
	if (!ctx) throw new Error("2D canvas unavailable");
	drawAtlas(ctx, chars);
	const tex = new CanvasTexture(ctx.canvas);
	tex.minFilter = LinearFilter;
	tex.magFilter = LinearFilter;
	tex.generateMipmaps = false;
	return tex;
}

function markGeometry(): ExtrudeGeometry {
	const shapes = markPaths().map(({ start, segments }) => {
		const shape = new Shape();
		shape.moveTo(...start);
		for (const s of segments) {
			if (s.length === 2) shape.lineTo(...s);
			else shape.bezierCurveTo(...s);
		}
		return shape;
	});
	const geometry = new ExtrudeGeometry(shapes, {
		depth: MARK_DEPTH,
		bevelEnabled: true,
		bevelThickness: MARK_BEVEL,
		bevelSize: MARK_BEVEL,
		bevelSegments: 2,
		curveSegments: 16,
	});
	geometry.translate(0, 0, -MARK_DEPTH / 2);
	return geometry;
}

/** Throws if WebGL is unavailable; callers keep their static fallback in that case. */
export function createAsciiScene(
	canvas: HTMLCanvasElement,
	options: AsciiSceneOptions = {},
): AsciiScene {
	let framing = options.framing ?? DEFAULT_FRAMING;
	const cell = options.cell ?? CELL;
	const mobileCellPx = options.mobileCellPx ?? 0;
	const reduce = options.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
	const colors = { glyph: "#8f8f8f", trail: "#d2fc52", background: "#050505", ...options.colors };

	const renderer = new WebGLRenderer({
		canvas,
		antialias: false,
		alpha: false,
		powerPreference: "high-performance",
	});
	const mobile = matchMedia("(max-width: 900px)").matches;
	renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
	renderer.setClearColor(0x000000, 0);
	const target = new WebGLRenderTarget(1, 1, {
		minFilter: NearestFilter,
		magFilter: NearestFilter,
	});

	const uTime = { value: 0 };
	const markMaterial = new ShaderMaterial({
		vertexShader: worldVertex,
		fragmentShader: markFragment,
		uniforms: { uTime },
	});
	const groundMaterial = new ShaderMaterial({
		vertexShader: worldVertex,
		fragmentShader: groundFragment,
		uniforms: { uTime },
		side: DoubleSide,
	});
	const mark = new Mesh(markGeometry(), markMaterial);
	mark.scale.setScalar(MARK_SCALE);
	mark.position.y = MARK_SCALE;
	const ground = new Mesh(new PlaneGeometry(8, 8), groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	const scene = new Scene().add(mark, ground);
	const camera = new OrthographicCamera();
	camera.position.set(0, MARK_SCALE + Math.sin(ELEVATION) * 5, Math.cos(ELEVATION) * 5);
	camera.lookAt(0, MARK_SCALE, 0);
	camera.near = 0.1;
	camera.far = 20;

	const atlas = glyphTexture(ALPHABET);
	const dot = glyphTexture(".");
	const trailPoints: Vector4[] = Array.from({ length: MAX_TRAIL }, () => new Vector4());
	const u = {
		uScene: { value: target.texture },
		uAtlas: { value: atlas },
		uDot: { value: dot },
		uResolution: { value: new Vector2(1, 1) },
		uCell: { value: new Vector2(cell, cell * 1.5) },
		uDotSpacing: { value: new Vector2(5.2, 7.8) },
		uTime,
		uCount: { value: ALPHABET.length },
		uContrast: { value: CONTRAST },
		uSpeed: { value: GLYPH_SPEED },
		uGlyph: { value: linear(colors.glyph) },
		uTrailColor: { value: linear(colors.trail) },
		uBg: { value: linear(colors.background) },
		uTrail: { value: trailPoints },
		uTrailCount: { value: 0 },
	};
	const post = new ShaderMaterial({
		vertexShader: postVertex,
		fragmentShader: postFragment,
		uniforms: u,
		depthTest: false,
		depthWrite: false,
	});
	const quad = new Mesh(new PlaneGeometry(2, 2), post);
	quad.frustumCulled = false;
	const postScene = new Scene().add(quad);
	const postCamera = new Camera();

	let scale = 1;
	let raf = 0;
	let started = false;
	let visible = true;
	let lost = false;
	let last = 0;
	let lastDraw = Number.NEGATIVE_INFINITY;
	let lastPointer = Number.NEGATIVE_INFINITY;
	let lastTrail = Number.NEGATIVE_INFINITY;
	let clock = 0;
	const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
	const trail: { x: number; y: number; t: number }[] = [];

	function resize() {
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		renderer.setSize(w, h, false);
		const buffer = renderer.getDrawingBufferSize(new Vector2());
		target.setSize(buffer.x, buffer.y);
		scale = designScale(w, h);
		u.uResolution.value.set(w / scale, h / scale);
		Object.assign(camera, frustum(w / scale, h / scale, framing));
		camera.updateProjectionMatrix();
		const cw = w <= 900 ? Math.max(cell * Math.min(1, 450 / w), mobileCellPx / scale) : cell;
		u.uCell.value.set(cw, cw * 1.5);
		trail.length = 0;
		request();
	}

	function draw(dt: number) {
		const t = reduce ? 0 : clock;
		uTime.value = t;
		const k = 1 - Math.exp(-dt * 7);
		pointer.x += (pointer.tx - pointer.x) * k;
		pointer.y += (pointer.ty - pointer.y) * k;
		mark.rotation.y = BASE_YAW + (reduce ? 0 : 0.4 * Math.sin(t * 0.16)) + pointer.x * 0.14;
		mark.rotation.x = pointer.y * 0.05;
		while (trail.length && t - trail[0].t > 2.2) trail.shift();
		trail.forEach((p, i) => {
			trailPoints[i].set(p.x, p.y, p.t, 1);
		});
		u.uTrailCount.value = trail.length;
		renderer.setRenderTarget(target);
		renderer.render(scene, camera);
		renderer.setRenderTarget(null);
		renderer.render(postScene, postCamera);
	}

	function frame(now: number) {
		raf = 0;
		const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
		last = now;
		clock += dt;
		const idle = now - lastPointer > 1000;
		if (reduce || !idle || now - lastDraw >= 1000 / 30 - 2) {
			draw(dt);
			lastDraw = now;
		}
		if (!reduce) request();
	}

	function request() {
		if (raf || !started || lost) return;
		if (!reduce && (!visible || document.hidden)) {
			last = 0;
			return;
		}
		raf = requestAnimationFrame(frame);
	}

	function onPointerMove(e: PointerEvent) {
		if (e.pointerType !== "mouse" || reduce) return;
		const r = canvas.getBoundingClientRect();
		const fx = (e.clientX - r.left) / r.width;
		const fy = (e.clientY - r.top) / r.height;
		const over = fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1;
		pointer.tx = over ? fx * 2 - 1 : 0;
		pointer.ty = over ? fy * 2 - 1 : 0;
		if (!over) return;
		const now = performance.now();
		lastPointer = now;
		if (now - lastTrail >= 45) {
			lastTrail = now;
			trail.push({ x: fx * u.uResolution.value.x, y: (1 - fy) * u.uResolution.value.y, t: clock });
			if (trail.length > MAX_TRAIL) trail.shift();
		}
		request();
	}

	const onVisibility = () => request();
	const onLost = (e: Event) => {
		e.preventDefault();
		lost = true;
		cancelAnimationFrame(raf);
		raf = 0;
		canvas.style.visibility = "hidden";
	};
	const onRestored = () => {
		lost = false;
		atlas.needsUpdate = true;
		dot.needsUpdate = true;
		canvas.style.visibility = "";
		resize();
	};
	const resizer = new ResizeObserver(resize);
	const seen = new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		request();
	});
	addEventListener("pointermove", onPointerMove, { passive: true });
	document.addEventListener("visibilitychange", onVisibility);
	canvas.addEventListener("webglcontextlost", onLost);
	canvas.addEventListener("webglcontextrestored", onRestored);

	const ready = (async () => {
		resize();
		// Compile off the main thread where KHR_parallel_shader_compile allows, so no long task.
		renderer.setRenderTarget(target);
		await renderer.compileAsync(scene, camera);
		renderer.setRenderTarget(null);
		await renderer.compileAsync(postScene, postCamera);
		draw(0);
		started = true;
		resizer.observe(canvas);
		seen.observe(canvas);
		request();
	})();

	return {
		ready,
		setFraming(next) {
			framing = next;
			resize();
		},
		dispose() {
			started = false;
			cancelAnimationFrame(raf);
			resizer.disconnect();
			seen.disconnect();
			removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("visibilitychange", onVisibility);
			canvas.removeEventListener("webglcontextlost", onLost);
			canvas.removeEventListener("webglcontextrestored", onRestored);
			for (const m of [mark, ground, quad]) m.geometry.dispose();
			for (const m of [markMaterial, groundMaterial, post]) m.dispose();
			atlas.dispose();
			dot.dispose();
			target.dispose();
			renderer.dispose();
		},
	};
}
