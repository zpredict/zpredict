/**
 * GLSL for the two passes (ASCII Studio spec §7.1–7.5). Pass 1 materials write data channels,
 * not colour: R live luminance, B stable luminance × 0.24 (0.75 marks the ground), A coverage.
 * Pass 2 turns that render target into glyphs. Three's ShaderMaterial maps this GLSL 1 style
 * (`varying`, `texture2D`, `gl_FragColor`) onto WebGL 2.
 */

export const worldVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vNormal = normalize(mat3(modelMatrix) * normal);
	gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const markFragment = /* glsl */ `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
	vec3 n = normalize(vNormal);
	float key = max(dot(n, normalize(vec3(-0.80, 0.50, 0.36))), 0.0);
	float fill = max(dot(n, normalize(vec3(0.73, 0.60, -0.14))), 0.0);
	float contact = 0.020 * exp(-max(vWorld.y, 0.0) / 0.02) * (1.0 - abs(n.y));
	float stable = clamp(0.24 + key * 0.43 + fill * 0.13 + max(n.y, 0.0) * 0.14 - contact, 0.22, 0.78);

	float t = uTime;
	float az = -1.0 + sin(t * 0.24) * 0.70;
	float el = 0.61 + sin(t * 0.13) * 0.07;
	vec3 movingKey = vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
	vec3 reflection = normalize(vec3(sin(t * 0.19 - 1.1), -0.45, cos(t * 0.19 - 1.1)));
	vec3 viewDir = normalize(cameraPosition - vWorld);
	float specular = pow(max(dot(n, normalize(viewDir + reflection)), 0.0), 24.0);
	float along = dot(vWorld, normalize(vec3(0.85, 0.10, 0.45))) - sin(t * 0.28) * 0.40;
	float ribbon = exp(-along * along / 0.0036);
	float movingDiffuse = clamp(dot(n, movingKey) - key, -1.0, 1.0) * 0.040;
	float movingShade = -0.022 * (1.0 - max(dot(n, movingKey), 0.0)) * ribbon;
	float change = clamp(movingDiffuse + specular * ribbon * 0.10 + movingShade, -0.06, 0.10);
	float headroom = change >= 0.0 ? 0.84 - stable : stable - 0.20;
	float limit = change >= 0.0 ? 0.10 : 0.06;
	float luminance = stable + change * headroom / (headroom + limit);
	gl_FragColor = vec4(luminance, 0.0, stable * 0.24, 1.0);
}`;

export const groundFragment = /* glsl */ `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
	vec2 xz = vWorld.xz;
	float glow = 0.90 + 0.07 * sin(dot(xz, vec2(16.0, 12.0)) - uTime * 0.75)
		+ 0.03 * sin(dot(xz, vec2(-41.0, 27.0)) + uTime * 1.10);
	gl_FragColor = vec4(glow, 0.0, 0.75, 1.0);
}`;

export const postVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const MAX_TRAIL = 64;

export const postFragment = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform sampler2D uDot;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform vec2 uDotSpacing;
uniform float uTime;
uniform float uCount;
uniform float uContrast;
uniform float uSpeed;
uniform vec3 uGlyph;
uniform vec3 uTrailColor;
uniform vec3 uBg;
uniform vec4 uTrail[${MAX_TRAIL}];
uniform int uTrailCount;
varying vec2 vUv;

// Colours arrive linear; the result is encoded to sRGB at the end, like three's output pass.
vec3 toSrgb(vec3 c) {
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float hash(vec2 p, vec2 k) { return fract(sin(dot(p, k)) * 43758.5453); }
vec4 cellAt(vec2 idx) { return texture2D(uScene, ((idx + 0.5) * uCell + uResolution * 0.5) / uResolution); }
bool isMark(vec4 s) { return s.a > 0.5 && s.b < 0.25; }

void main() {
	vec2 pixel = vUv * uResolution;
	vec2 grid = (pixel - uResolution * 0.5) / uCell;
	vec2 ci = floor(grid);
	float cellHash = hash(ci, vec2(127.1, 311.7));
	vec4 s = cellAt(ci);
	vec3 color = uBg;

	vec4 here = texture2D(uScene, vUv);
	if (here.a > 0.5 && here.b > 0.25) {
		float dotMask = texture2D(uDot, 0.02 + fract(pixel / uDotSpacing) * 0.96).r;
		color = mix(uBg, uGlyph * 0.20812 * here.r, dotMask);
	}

	if (isMark(s)) {
		float stable = clamp(s.b / 0.24, 0.0, 1.0);
		float accent = s.r - stable;
		float light = clamp((stable + accent * 0.75 - 0.5) * uContrast + 0.5, 0.0, 1.0);
		float surface = clamp((stable + accent * 0.35 - 0.5) * uContrast + 0.5, 0.0, 1.0);
		float silhouette = 0.0;
		float tone = 0.0;
		float up = 0.0;
		float down = 0.0;
		vec2 offs[4];
		offs[0] = vec2(1.0, 0.0); offs[1] = vec2(-1.0, 0.0); offs[2] = vec2(0.0, 1.0); offs[3] = vec2(0.0, -1.0);
		for (int i = 0; i < 4; i++) {
			vec4 ns = cellAt(ci + offs[i]);
			if (!isMark(ns)) { silhouette = 1.0; continue; }
			float d = clamp(ns.b / 0.24, 0.0, 1.0) - stable;
			tone = max(tone, abs(d));
			up = max(up, d);
			down = max(down, -d);
		}
		float edge = max(silhouette, smoothstep(0.14, 0.30, tone));
		float innerFold = smoothstep(0.08, 0.26, up);
		float foldRim = smoothstep(0.08, 0.26, down);
		float density = clamp((light - 0.5) * 1.15 + 0.5, 0.0, 1.0);
		density += (sin(dot(ci, vec2(0.073, 0.051)) - uTime * 0.55)
			+ 0.45 * sin(dot(ci, vec2(-0.037, 0.089)) + uTime * 0.31)) * 0.012;
		density = max(density, edge * 0.28);

		if (light >= 0.12 || edge > 0.5) {
			float tile = clamp(floor(density * uCount), 0.0, uCount - 1.0);
			float interval = mix(0.35, 0.55, hash(ci, vec2(269.5, 183.3)));
			float phase = mod(floor(uTime * uSpeed / interval + cellHash * 4.0), 4.0);
			tile += phase < 0.5 ? -1.0 : (phase > 1.5 && phase < 2.5 ? 1.0 : 0.0);
			if (tile < 0.0) tile = -tile;
			if (tile > uCount - 1.0) tile = 2.0 * (uCount - 1.0) - tile;
			vec2 f = fract(grid);
			float mask = texture2D(uAtlas, vec2((tile + 0.02 + f.x * 0.96) / uCount, 0.02 + f.y * 0.96)).r;

			float trail = 0.0;
			vec2 center = (ci + 0.5) * uCell + uResolution * 0.5;
			for (int i = 0; i < ${MAX_TRAIL}; i++) {
				if (i >= uTrailCount) break;
				vec4 p = uTrail[i];
				float age = uTime - p.z;
				if (age < 0.0 || age > 2.2) continue;
				float probability = 0.78 * (1.0 - smoothstep(0.0, 26.0, distance(center, p.xy)));
				if (cellHash < probability) trail = max(trail, pow(1.0 - age / 2.2, 1.35) * p.w);
			}

			vec3 glyph = mix(uGlyph, uTrailColor, trail);
			float ink = (0.10 + 0.90 * pow(surface, 1.05)) * (1.0 - innerFold * 0.15) + foldRim * 0.07;
			glyph *= clamp(max(ink, silhouette * 0.66), 0.0, 1.0);
			color = mix(uBg, glyph, mask);
		}
	}
	gl_FragColor = vec4(toSrgb(color), 1.0);
}`;
