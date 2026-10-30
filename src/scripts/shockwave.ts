// Shared radial shock-wave controller.
//
// One transparent, fixed, full-viewport WebGL2 canvas sits above the halftone background and below the
// page content. Callers fire a wave with `fireWave()`; each wave is a ring that grows from an anchor
// point (an element's centre) to past the screen corners, with a wobbly edge, RGB fringing and a
// rippling halo. The canvas draws only colour, never a background: it is cleared to (0,0,0,0) and
// rendered with premultiplied alpha. `activeRings()` exposes the live rings in viewport pixels, so the
// halftone background can push its dots along the wavefront (see HalftoneBackground.astro).
// An element can also get its own small ring (`box`), e.g. the media box of a carousel.
//
// No dependencies. With prefers-reduced-motion nothing is drawn. Without WebGL2 a CSS ring is used for
// the page wave; the halftone reaction does not need WebGL and works either way.

/**
 * Every tunable of the wave, in one place. How each one reaches the shader:
 *
 * | key            | unit                           | shader uniform / use                                     |
 * |----------------|--------------------------------|----------------------------------------------------------|
 * | duration       | ms                             | time base of the ring progress (CPU, feeds uRings.z/.w)  |
 * | easing         | name in EASINGS                | eases progress → ring radius (uRings.z)                  |
 * | maxRadius      | × distance to farthest corner  | final radius: 1 = touches the farthest corner (uRings.z) |
 * | thickness      | css px (gaussian half-width)   | uThick: width of the bright core line                    |
 * | haloWidth      | css px                         | uHaloW: width of the soft wake behind the core           |
 * | intensity      | 0..1 (peak alpha)              | uIntensity: opacity of the core                          |
 * | haloIntensity  | 0..1 (peak alpha)              | uHaloI: opacity of the wake                              |
 * | ringColor      | CSS custom property or colour  | uRing                                                    |
 * | haloColor      | CSS custom property or colour  | uHalo                                                    |
 * | lobes          | count                          | uLobes: bumps of the wobbly edge                         |
 * | wobble         | css px                         | uWobble: depth of the bumps                              |
 * | rippleFreq     | ripples per reference height   | uRipF: rings travelling inside the wake                  |
 * | rippleAmount   | 0..1                           | uRipA: how strongly the ripples modulate the wake        |
 * | aberration     | css px                         | uAberr: radial red/blue split of the core                |
 * | halftoneShift  | css px                         | (CPU) max displacement of the halftone field at the ring |
 * | halftoneLift   | 0..1                           | (CPU) extra brightness of halftone dots on the ring      |
 * | halftoneWidth  | css px                         | (CPU) width of the band of halftone that reacts          |
 * | halftoneGain   | sprite gain (halftone: 0.09)   | (CPU) brightness ceiling of the dots inside that band    |
 * | maxDpr         | device pixel ratio cap         | canvas resolution                                        |
 *
 * The envelope is sin(π·progress): every effect fades in, peaks mid-way and is exactly 0 at the end,
 * so nothing jumps when a wave finishes. A box ring uses the same values scaled by
 * box height / viewport height.
 */
export const WAVE = {
	duration: 850,
	easing: "quadInOut" as keyof typeof EASINGS,
	maxRadius: 1.05,
	thickness: 7,
	haloWidth: 110,
	intensity: 0.5,
	haloIntensity: 0.14,
	ringColor: "--fg",
	haloColor: "--muted",
	lobes: 6,
	wobble: 22,
	rippleFreq: 40,
	rippleAmount: 0.6,
	aberration: 2,
	halftoneShift: 26,
	halftoneLift: 0.6,
	halftoneWidth: 60,
	halftoneGain: 0.5,
	maxDpr: 1.5,
};

export const EASINGS = {
	linear: (x: number) => x,
	quadInOut: (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
	sineInOut: (x: number) => -(Math.cos(Math.PI * x) - 1) / 2,
	cubicOut: (x: number) => 1 - Math.pow(1 - x, 3),
	quintOut: (x: number) => 1 - Math.pow(1 - x, 5),
};

const MAX_RINGS = 4;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shared clock (ms), so every consumer samples the same moment of a wave. */
export const now = () => performance.now();

/** Progress, radius and envelope of a wave `elapsed` ms after it started. `reach` is the final radius in px. */
export function waveAt(elapsed: number, reach: number, scale = 1) {
	const t = clamp01(elapsed / WAVE.duration);
	const p = (EASINGS[WAVE.easing] ?? EASINGS.quadInOut)(t);
	const start = -WAVE.thickness * 2 * scale;
	return { t, p, front: start + (reach - start) * p, inten: Math.sin(Math.PI * p) };
}

// ---------- state ----------
type Wave = { start: number; anchor: Element | null; x: number; y: number; box: BoxSurface | null; page: boolean };
const waves: Wave[] = [];

export type Ring = { x: number; y: number; front: number; inten: number };

const centerOf = (w: Wave) => {
	if (w.anchor && w.anchor.isConnected) {
		const r = w.anchor.getBoundingClientRect();
		if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}
	return { x: w.x, y: w.y };
};
const farthestCorner = (x: number, y: number, W: number, H: number) =>
	Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));

/** Live page rings in viewport css px (empty when idle). Cheap to call every frame. */
export function activeRings(t = now()): Ring[] {
	const out: Ring[] = [];
	for (const w of waves) {
		if (!w.page) continue;
		const e = t - w.start;
		if (e < 0 || e > WAVE.duration) continue;
		const c = centerOf(w);
		const s = waveAt(e, WAVE.maxRadius * farthestCorner(c.x, c.y, innerWidth, innerHeight));
		out.push({ x: c.x, y: c.y, front: s.front, inten: s.inten });
		if (out.length === MAX_RINGS) break;
	}
	return out;
}

// ---------- colours from the design tokens ----------
let colorCtx: CanvasRenderingContext2D | null = null;
function tokenColor(value: string, fallback: number[]): number[] {
	let v = value;
	if (v.startsWith("--")) v = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
	if (!v) return fallback;
	colorCtx ??= document.createElement("canvas").getContext("2d");
	if (!colorCtx) return fallback;
	colorCtx.fillStyle = "#000";
	colorCtx.fillStyle = v;
	const s = String(colorCtx.fillStyle);
	if (s.startsWith("#")) return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
	const m = s.match(/[\d.]+/g);
	return m ? m.slice(0, 3).map((n) => +n / 255) : fallback;
}

// ---------- WebGL surface ----------
const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;        // canvas size, device px
uniform float uDpr, uTime;
uniform int uCount;
uniform vec4 uRings[${MAX_RINGS}]; // centre x, centre y, front radius, envelope (css px, y down)
uniform float uScale;     // px-valued params are multiplied by this (1 for the page, box/viewport for a box)
uniform float uUnit;      // reference height for the ripple frequency (css px)
uniform vec3 uRing, uHalo;
uniform float uThick, uHaloW, uIntensity, uHaloI, uLobes, uWobble, uRipF, uRipA, uAberr;
float gauss(float x, float w) { return exp(-(x * x) / (w * w)); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 col = vec3(0.0);
  float a = 0.0;
  for (int i = 0; i < ${MAX_RINGS}; i++) {
    if (i >= uCount) break;
    vec4 r = uRings[i];
    vec2 d = p - r.xy;
    float dist = length(d);
    float ang = atan(d.y, d.x);
    float inten = r.w;
    float th = max(uThick * uScale, 0.75);
    float front = r.z + sin(ang * uLobes + uTime * 3.0) * uWobble * uScale * inten * smoothstep(0.0, th * 6.0, r.z);
    float x = dist - front;
    float s = uAberr * uScale * inten;
    vec3 core = vec3(gauss(x - s, th), gauss(x, th), gauss(x + s, th)) * uIntensity * inten;
    float hw = max(uHaloW * uScale, 1.0);
    float wake = x < 0.0 ? gauss(x, hw) : gauss(x, th * 2.0);
    float rip = 1.0 - uRipA + uRipA * (0.5 + 0.5 * sin(dist / uUnit * uRipF - uTime * 8.0));
    float h = wake * rip * uHaloI * inten;
    col += uRing * core + uHalo * h;
    a += max(max(core.r, core.g), core.b) + h;
  }
  a = min(a, 1.0);
  fragColor = vec4(min(col, vec3(a)), a); // premultiplied
}`;

class Surface {
	private loc = new Map<string, WebGLUniformLocation | null>();
	private constructor(
		readonly canvas: HTMLCanvasElement,
		private gl: WebGL2RenderingContext,
		private prog: WebGLProgram,
	) {}

	static create(canvas: HTMLCanvasElement): Surface | null {
		const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
		if (!gl) return null;
		const sh = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
				console.warn("[shockwave]", gl.getShaderInfoLog(s));
				return null;
			}
			return s;
		};
		const v = sh(gl.VERTEX_SHADER, VS);
		const f = sh(gl.FRAGMENT_SHADER, FS);
		if (!v || !f) return null;
		const prog = gl.createProgram()!;
		gl.attachShader(prog, v);
		gl.attachShader(prog, f);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
		gl.bindVertexArray(gl.createVertexArray());
		gl.clearColor(0, 0, 0, 0);
		const s = new Surface(canvas, gl, prog);
		canvas.addEventListener("webglcontextlost", (e) => {
			e.preventDefault();
			s.lost = true;
		});
		return s;
	}

	lost = false;
	private u(name: string) {
		if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.prog, name));
		return this.loc.get(name)!;
	}

	/** rings in css px of this canvas; scale multiplies the px params; unit is the ripple reference height */
	render(rings: Ring[], scale: number, unit: number, colors: { ring: number[]; halo: number[] }) {
		const { gl, canvas } = this;
		if (this.lost) return;
		const dpr = Math.min(WAVE.maxDpr, devicePixelRatio || 1);
		const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
		const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		gl.viewport(0, 0, w, h);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (!rings.length) return;
		gl.useProgram(this.prog);
		const data = new Float32Array(MAX_RINGS * 4);
		rings.slice(0, MAX_RINGS).forEach((r, i) => data.set([r.x, r.y, r.front, r.inten], i * 4));
		gl.uniform4fv(this.u("uRings"), data);
		gl.uniform1i(this.u("uCount"), Math.min(rings.length, MAX_RINGS));
		gl.uniform2f(this.u("uRes"), w, h);
		gl.uniform1f(this.u("uDpr"), dpr);
		gl.uniform1f(this.u("uTime"), now() / 1000);
		gl.uniform1f(this.u("uScale"), scale);
		gl.uniform1f(this.u("uUnit"), Math.max(1, unit));
		gl.uniform3fv(this.u("uRing"), colors.ring);
		gl.uniform3fv(this.u("uHalo"), colors.halo);
		gl.uniform1f(this.u("uThick"), WAVE.thickness);
		gl.uniform1f(this.u("uHaloW"), WAVE.haloWidth);
		gl.uniform1f(this.u("uIntensity"), WAVE.intensity);
		gl.uniform1f(this.u("uHaloI"), WAVE.haloIntensity);
		gl.uniform1f(this.u("uLobes"), WAVE.lobes);
		gl.uniform1f(this.u("uWobble"), WAVE.wobble);
		gl.uniform1f(this.u("uRipF"), WAVE.rippleFreq);
		gl.uniform1f(this.u("uRipA"), WAVE.rippleAmount);
		gl.uniform1f(this.u("uAberr"), WAVE.aberration);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
}

// ---------- page canvas + box canvases ----------
let page: Surface | null = null;
let pageFailed = false;

function ensurePage() {
	if (page || pageFailed || reduced()) return;	const c = document.createElement("canvas");
	c.className = "shockwave-canvas";
	c.setAttribute("aria-hidden", "true");
	// same z-index as the halftone layer but later in the DOM: above it, below the z-index:1 sections and the nav
	c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;display:block";
	document.body.append(c);
	page = Surface.create(c);
	if (!page) {
		c.remove();
		pageFailed = true;
	}
}

/** Create the page canvas ahead of time (shader compile) so the first wave doesn't stutter. */
export function prepareWave() {
	const go = () => ensurePage();
	if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1500 });
	else setTimeout(go, 200);
}

class BoxSurface {
	surface: Surface | null;
	constructor(readonly el: HTMLElement) {
		const c = document.createElement("canvas");
		c.setAttribute("aria-hidden", "true");
		c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;display:block";
		el.append(c);
		this.surface = Surface.create(c);
		if (!this.surface) c.remove();
	}
}
const boxes = new Map<Element, BoxSurface>();

/** Final radius of a box ring (the farthest corner from the box centre, × maxRadius), and its scale. */
export function boxGeometry(el: Element) {
	const r = el.getBoundingClientRect();
	return { reach: (WAVE.maxRadius * Math.hypot(r.width, r.height)) / 2, scale: Math.min(1, Math.max(0.15, r.height / innerHeight)), w: r.width, h: r.height };
}

// ---------- CSS fallback ring (no WebGL2) ----------
function cssRing(w: Wave, colors: { ring: number[]; halo: number[] }) {
	const c = centerOf(w);
	const reach = WAVE.maxRadius * farthestCorner(c.x, c.y, innerWidth, innerHeight);
	const rgb = (v: number[], a: number) => `rgba(${v.map((n) => Math.round(n * 255)).join(",")},${a})`;
	const d = document.createElement("div");
	d.className = "shockwave-ring";
	d.setAttribute("aria-hidden", "true");
	d.style.cssText = `position:fixed;left:${c.x - reach}px;top:${c.y - reach}px;width:${2 * reach}px;height:${2 * reach}px;border-radius:50%;pointer-events:none;z-index:0;border:${Math.max(1, WAVE.thickness / 3)}px solid ${rgb(colors.ring, WAVE.intensity)};box-shadow:inset 0 0 ${WAVE.haloWidth / 2}px ${rgb(colors.halo, WAVE.haloIntensity)};transform:scale(0);opacity:0`;
	document.body.append(d);
	const a = d.animate(
		[
			{ transform: "scale(0)", opacity: 0 },
			{ transform: "scale(0.5)", opacity: 1, offset: 0.5 },
			{ transform: "scale(1)", opacity: 0 },
		],
		{ duration: WAVE.duration, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
	);
	a.onfinish = () => d.remove();
}

// ---------- loop ----------
let raf = 0;
let colors = { ring: [1, 1, 1], halo: [0.54, 0.54, 0.54] };

function frame() {
	raf = 0;
	const t = now();
	for (let i = waves.length - 1; i >= 0; i--) if (t - waves[i].start > WAVE.duration) waves.splice(i, 1);

	if (page) page.render(activeRings(t), 1, innerHeight, colors);
	for (const b of boxes.values()) {
		if (!b.surface) continue;
		const g = boxGeometry(b.el);
		const rings: Ring[] = [];
		for (const w of waves) {
			if (w.box !== b) continue;
			const s = waveAt(t - w.start, g.reach, g.scale);
			rings.push({ x: g.w / 2, y: g.h / 2, front: s.front, inten: s.inten });
		}
		b.surface.render(rings, g.scale, g.h, colors);
	}
	if (waves.length) raf = requestAnimationFrame(frame);
}

/**
 * Fire one wave. `anchor` (or x/y in viewport px) is the centre of the page ring; `box` also plays a
 * contained ring inside that element. `page: false` skips the page ring. Returns the start time
 * (use it with waveAt/boxGeometry to sync things like a clip-path reveal), or -1 with reduced motion.
 */
export function fireWave(o: { anchor?: Element | null; x?: number; y?: number; box?: HTMLElement | null; page?: boolean } = {}) {
	if (reduced()) return -1;
	ensurePage();
	colors = {
		ring: tokenColor(WAVE.ringColor, [1, 1, 1]),
		halo: tokenColor(WAVE.haloColor, [0.54, 0.54, 0.54]),
	};
	let box: BoxSurface | null = null;
	if (o.box) {
		box = boxes.get(o.box) ?? new BoxSurface(o.box);
		boxes.set(o.box, box);
	}
	const w: Wave = {
		start: now(),
		anchor: o.anchor ?? null,
		x: o.x ?? innerWidth / 2,
		y: o.y ?? innerHeight / 2,
		box,
		page: o.page !== false,
	};
	waves.push(w);	while (waves.filter((x) => x.page).length > MAX_RINGS) waves.splice(waves.findIndex((x) => x.page), 1);
	if (w.page && (!page || page.lost)) cssRing(w, colors);
	if (!raf) raf = requestAnimationFrame(frame);
	return w.start;
}
