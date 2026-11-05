// Work's camera journey: scrolling drives a camera over the dot field. It starts looking straight down
// (the dots read as a flat background) and tilts quickly to show the first project far away, then flies
// up to it. At each project the camera stops and its images scroll 1:1 like a normal page; from the last
// image it orbits to the next project, and after the last one it rises straight back up.
// Project cards are real DOM placed in CSS 3D by the same camera. The dots show only while the camera
// travels, so the images and videos rest on a plain background.
//
// Tuned for 3 projects: 45° between stops, 90° in total. A top view only lines up with the screen when the
// final turn is a multiple of 90°, so changing the project count means retuning TURN_PER_PROJECT.

import { firstProject, hops } from "./firstProject";

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sstep = (a: number, b: number, x: number) => {
	const t = clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
type Vec3 = [number, number, number];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const TOP_H = 6;
const TURN_PER_PROJECT = rad(45);
const ORBIT = { camera: 11.4, panel: 7.5, height: 1.42, centerZ: -13.4 };
const VIEW_DISTANCE = ORBIT.camera - ORBIT.panel;
const PX = 300; // CSS pixels per world unit on the cards
const PANEL_W = 3;
const NAV_CLEARANCE = 84;
const FAR = 4; // how far back from the first stop the first project is first seen
const DOT_PX = 6; // grid cell on screen in the top view, same as the hero's halftone
const RELIEF = 0.3;

// A project coming in: dark and faint from far away, gaining light evenly until it's sharp at the stop.
// All measured on the way from where it's first seen (0) to its stop (1)
const COMING = { faint: 0.3, dark: 0.22, grey: 0.45, showTo: 0.36, lightFrom: 0.36, lightTo: 0.95 };
const CAPTION_BLUR = 1.6; // px, as the text leaves
// The text's entrance, same timing as the hero's headline: each line starts later, each letter after the last
const LINE_DELAY = 0.25;
const CHAR_DELAY = 0.05;
const CHAR_DURATION = 0.3;
// Those timings are mapped onto the approach: the letters finish here, the tag and link row arrives from here
const CAP_LETTERS_END = 0.88;
const CAP_META_FROM = 0.72;
const QUANTIZE = 60; // steps from sharp to distorted: the filters only re-render when the step changes

type Key = { t: number; v: number[]; flat: boolean; m: number[] };
const onOrbit = (a: number, r: number, y: number): Vec3 => [Math.sin(a) * r, y, ORBIT.centerZ + Math.cos(a) * r];

// All lengths are scroll distance in pixels; hold[i] is how far project i's images scroll
function buildRoute(hold: number[], H: number) {
	const stops = hold.map((_, i) => i * TURN_PER_PROJECT);
	const SCROLL = { lead: 0.75 * H, tilt: 0.35 * H, approach: 0.42 * H, transit: 0.75 * H, exit: 0.3 * H };
	const K: Key[] = [];
	const holds: [number, number][] = [];
	let time = 0;
	const add = (p: Vec3, yaw: number, pitch: number, dur = 0, flat = false) => {
		time += dur;
		K.push({ t: time, v: [p[0], p[1], p[2], yaw, pitch], flat, m: [] });
	};

	const far = onOrbit(stops[0], ORBIT.camera + FAR, ORBIT.height + 0.15);
	add([far[0], TOP_H, far[2] - 0.5], stops[0], rad(-90), 0, true);
	// a short pause at the far view, so the first project is seen from there before flying in
	add(far, stops[0], rad(-2), SCROLL.tilt, true);
	stops.forEach((a, i) => {
		const cam = onOrbit(a, ORBIT.camera, ORBIT.height);
		if (i) {
			const mid = (stops[i - 1] + a) / 2;
			add(onOrbit(mid, ORBIT.camera, ORBIT.height - 0.08), mid, rad(-5), SCROLL.transit / 2);
		}
		add(cam, a, 0, i ? SCROLL.transit / 2 : SCROLL.approach, true);
		const start = time;
		add(cam, a, 0, hold[i], true);
		holds.push([start, time]);
	});
	const lastA = stops[stops.length - 1];
	const last = onOrbit(lastA, ORBIT.camera, ORBIT.height);
	add([last[0] - 0.5 * Math.sin(lastA), TOP_H, last[2] - 0.5 * Math.cos(lastA)], lastA, rad(-90), SCROLL.exit, true);

	const total = time;
	K.forEach((k) => (k.t /= total));
	holds.forEach((h) => {
		h[0] /= total;
		h[1] /= total;
	});
	K.forEach((k, i) => {
		k.m = k.v.map((_, c) => (k.flat ? 0 : (K[i + 1].v[c] - K[i - 1].v[c]) / (K[i + 1].t - K[i - 1].t)));
	});
	return { K, holds, stops, total, lead: SCROLL.lead, transit: SCROLL.transit };
}

// Hermite spline through the keys: Catmull-Rom on the transit points, zero slope at the stops
function sample(K: Key[], p: number) {
	if (p <= 0) return K[0].v;
	if (p >= 1) return K[K.length - 1].v;
	let i = 0;
	while (i < K.length - 2 && K[i + 1].t < p) i++;
	const a = K[i];
	const b = K[i + 1];
	const h = b.t - a.t;
	const u = (p - a.t) / h;
	const u2 = u * u;
	const u3 = u2 * u;
	return a.v.map(
		(_, c) =>
			(2 * u3 - 3 * u2 + 1) * a.v[c] +
			(u3 - 2 * u2 + u) * h * a.m[c] +
			(-2 * u3 + 3 * u2) * b.v[c] +
			(u3 - u2) * h * b.m[c],
	);
}

function basis(yaw: number, pitch: number, roll: number) {
	const cp = Math.cos(pitch);
	const f: Vec3 = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
	const r0: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
	const u0: Vec3 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
	const c = Math.cos(roll);
	const s = Math.sin(roll);
	const r: Vec3 = [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s];
	const u: Vec3 = [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s];
	return { f, r, u };
}

const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

// One fullscreen pass: raymarches the height field and draws the halftone on the hit point
const FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec3 uPos, uR, uU, uF, uPtr;
uniform float uTan, uAspect, uTime, uAmp, uCell, uGround, uVis, uEdgeTop, uEdgeBottom, uScale;

const float TAU = 6.28318530718;

float heightAt(vec2 p) {
	return uAmp * (0.6 * sin(p.x * 0.33 + 1.3 * sin(p.y * 0.21)) * sin(p.y * 0.29 + 0.8)
		+ 0.28 * sin(p.x * 0.87 + p.y * 0.58)
		+ 0.09 * sin(p.x * 2.1 - p.y * 1.7));
}
vec3 grad3(vec3 p) {
	p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
	return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise3(vec3 p) {
	vec3 i = floor(p), f = fract(p);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	return mix(mix(mix(dot(grad3(i), f), dot(grad3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
		mix(dot(grad3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(grad3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
		mix(mix(dot(grad3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(grad3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
		mix(dot(grad3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(grad3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}
float sig(float c) { return 1.0 / (1.0 + 7.5 * exp(-4.0 * c + 0.25)); }
float bands(float v) {
	float c = 0.5 - 0.5 * cos(TAU * v);
	float a = sig(0.0), b = sig(1.0);
	return (sig(c) - a) / (b - a);
}
float dotMask(vec2 g, float r) {
	vec2 dg = fwidth(g);
	float aa = max(dg.x, dg.y) * 0.75;
	float d = length(fract(g) - 0.5);
	// soft-edged dots; far away they melt into an even tone
	float m = 1.0 - smoothstep(min(r * 0.3, r - aa), r + aa, d);
	return mix(m, 1.6 * r * r, smoothstep(0.22, 0.6, aa));
}

void main() {
	vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
	vec3 dir = normalize(uR * ndc.x * uTan * uAspect + uU * ndc.y * uTan + uF);
	vec3 col = vec3(0.039);

	// flat at the top view it melts into the neighbouring sections, as the hero's field does
	float fromTop = uRes.y - gl_FragCoord.y;
	float fadeY = 90.0 * uScale;
	float edges = mix(1.0, smoothstep(0.0, fadeY, fromTop), uEdgeTop)
		* mix(1.0, smoothstep(0.0, fadeY, gl_FragCoord.y), uEdgeBottom);
	float sideW = min(120.0 * uScale, uRes.x * 0.08);
	edges *= mix(smoothstep(0.0, sideW, gl_FragCoord.x) * smoothstep(0.0, sideW, uRes.x - gl_FragCoord.x), 1.0, uGround);
	float vis = uVis * edges;

	col += vec3(0.028) * exp(-abs(dir.y) * 9.0) * uGround * vis;

	if (dir.y > 0.0) {
		// sparse dots on a high plane: they give the turns something to slide against
		float s = (16.0 - uPos.y) / dir.y;
		vec2 q = (uPos + dir * s).xz / 1.5;
		float h = fract(sin(dot(floor(q), vec2(41.3, 289.1))) * 43758.5453);
		if (h > 0.72) {
			col += vec3(0.16) * dotMask(q, 0.05 + 0.05 * fract(h * 17.0)) * exp(-s * 0.018) * uGround * vis;
		}
	} else {
		float t = max(0.0, (uPos.y - uAmp * 0.97) / -dir.y);
		vec3 p = uPos + dir * t;
		if (uAmp > 0.001) {
			for (int i = 0; i < 26; i++) {
				float gap = p.y - heightAt(p.xz);
				if (gap < 0.006 || t > 70.0) break;
				float dt = gap * 0.62 / max(-dir.y, 0.07);
				t += dt;
				p += dir * dt;
			}
		}
		vec2 g = p.xz / uCell;
		vec2 center = (floor(g) + 0.5) * uCell;
		float n = 0.5 + 1.6 * noise3(vec3(center.x * 0.35, center.y * 0.31 + uTime * 0.16, 7.3 + uTime * 0.14));
		float base = max(0.0, bands(smoothstep(0.0, 1.0, 1.0 - n) + uTime * 0.03) - 0.2) / 0.8;

		// low sun over the dunes
		vec2 e = vec2(0.09, 0.0);
		vec3 nor = normalize(vec3(heightAt(center - e.xy) - heightAt(center + e.xy), 2.0 * e.x, heightAt(center - e.yx) - heightAt(center + e.yx)));
		float sun = clamp(dot(nor, normalize(vec3(-0.62, 0.42, -0.5))), 0.0, 1.0);

		vec2 dp = center - uPtr.xy;
		float L = base * mix(0.75, 0.62 + 0.55 * sun, uGround) + uPtr.z * exp(-dot(dp, dp) / 1.6) * 0.3;
		L = clamp(L, 0.0, 1.2);
		float m = dotMask(g, 0.43 * sqrt(clamp(L, 0.0, 1.0)) + 0.012 * uGround);
		float lum = mix(0.062, 0.2, uGround) * (0.45 + L);
		float fog = exp(-t * mix(0.0, 0.085, uGround));
		// the dots right under the lens would read too big and hard
		float near = mix(1.0, smoothstep(0.9, 3.2, t), uGround);
		col += vec3(lum) * m * fog * near * vis;
	}
	outColor = vec4(col, 1.0);
}`;

const UNIFORMS = [
	"uRes", "uPos", "uR", "uU", "uF", "uPtr", "uTan", "uAspect", "uTime", "uAmp",
	"uCell", "uGround", "uVis", "uEdgeTop", "uEdgeBottom", "uScale",
] as const;

function createField(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
	if (!gl) return null;
	const compile = (type: number, src: string) => {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		return s;
	};
	const prog = gl.createProgram()!;
	gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
	gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
	gl.useProgram(prog);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const loc = gl.getAttribLocation(prog, "a");
	gl.enableVertexAttribArray(loc);
	gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<
		(typeof UNIFORMS)[number],
		WebGLUniformLocation | null
	>;
	return { gl, U };
}

// wraps each letter of a text in its own element. Screen readers get the text whole, from a hidden copy
function splitChars(el: HTMLElement) {
	const words = (el.textContent ?? "").trim().split(/\s+/);
	const read = document.createElement("span");
	read.className = "journey__read";
	read.textContent = words.join(" ");
	const shown = document.createElement("span");
	shown.setAttribute("aria-hidden", "true");
	const chars: HTMLElement[] = [];
	words.forEach((word, i) => {
		if (i) shown.append(" ");
		const box = document.createElement("span");
		box.className = "journey__word";
		for (const c of word) {
			const ch = document.createElement("span");
			ch.className = "journey__char";
			ch.textContent = c;
			box.append(ch);
			chars.push(ch);
		}
		shown.append(box);
	});
	el.replaceChildren(read, shown);
	return chars;
}

const setStyleFilter = (el: HTMLElement, value: string, cache: WeakMap<HTMLElement, string>) => {
	if (cache.get(el) === value) return;
	cache.set(el, value);
	el.style.filter = value;
};

function start(journey: HTMLElement) {
	const pin = journey.querySelector<HTMLElement>("[data-journey-pin]")!;
	const stage = journey.querySelector<HTMLElement>("[data-journey-stage]")!;
	const lines = journey.querySelector<HTMLElement>("[data-journey-lines]")!;
	const canvas = journey.querySelector<HTMLCanvasElement>("[data-journey-field]")!;
	const pageFrame = journey.closest<HTMLElement>(".page-frame");
	const panelEls = [...journey.querySelectorAll<HTMLElement>("[data-journey-panel]")];
	const caps = [...journey.querySelectorAll<HTMLElement>("[data-journey-cap]")];

	const field = createField(canvas);
	if (!field || !panelEls.length) {
		journey.classList.remove("is-3d");
		return;
	}
	const { gl, U } = field;
	let route = buildRoute(panelEls.map(() => 0), 1);
	const panels = panelEls.map((el, i) => ({
		el,
		i,
		yaw: i * TURN_PER_PROJECT,
		c: [0, 0, 0] as Vec3,
		scale: 1,
		travel: 0, // world units its images move up during the stop
		shots: [...el.querySelectorAll<HTMLElement>("[data-journey-shot]")],
	}));
	const capParts = caps.map((cap) => [...cap.querySelectorAll<HTMLElement>("[data-journey-part]")]);
	const capChars = capParts.map((parts) => parts.slice(0, -1).flatMap(splitChars));
	const capMeta = capParts.map((parts) => parts[parts.length - 1]);
	const capSeen = caps.map(() => -1);
	const charTimes = new WeakMap<HTMLElement, [number, number]>();

	// When each letter appears, from the lines the text actually wraps into, as a share of the whole entrance.
	// A space counts as a letter, as in the headline
	function timeCapChars() {
		capChars.forEach((chars, i) => {
			let line = -1;
			let lastTop = NaN;
			let lastWord: Element | null = null;
			let index = 0;
			const delays = chars.map((ch) => {
				if (Math.abs(ch.offsetTop - lastTop) >= 4 || line < 0) {
					line++;
					index = 0;
				} else if (ch.parentElement !== lastWord) {
					index++;
				}
				lastTop = ch.offsetTop;
				lastWord = ch.parentElement;
				return line * LINE_DELAY + index++ * CHAR_DELAY;
			});
			const total = Math.max(...delays, 0) + CHAR_DURATION;
			chars.forEach((ch, j) => charTimes.set(ch, [delays[j] / total, (delays[j] + CHAR_DURATION) / total]));
			capSeen[i] = -1;
		});
	}

	const applied = new WeakMap<HTMLElement, string>();
	let W = 1;
	let H = 1;
	let tanHalf = Math.tan(rad(20));
	let F = 1000;
	let cell = 0.03;
	let relief = RELIEF;
	let quality = Math.min(1.5, window.devicePixelRatio || 1);
	let firstRatio = 0.625; // the first image's height / width
	let shiftPx = 0; // where the images' centre sits on screen at a stop, from the screen's centre
	let wideView = true;

	// tells the butterfly where the first image is, as seen from this camera
	function publishFirst(cam: number[], view: { f: Vec3; r: Vec3; u: Vec3 }) {
		Object.assign(firstProject, onScreen(panels[0], cam, view, 0));
		firstProject.ready = true;
	}

	function onScreen(pa: (typeof panels)[number], cam: number[], view: { f: Vec3; r: Vec3; u: Vec3 }, lift: number) {
		const d: Vec3 = [pa.c[0] - cam[0], pa.c[1] + lift - cam[1], pa.c[2] - cam[2]];
		const unit = F / Math.max(dot(d, view.f), 0.7);
		const hw = (PANEL_W / 2) * pa.scale * unit;
		return { x: W / 2 + dot(d, view.r) * unit, y: H / 2 - dot(d, view.u) * unit, hw, hh: hw * firstRatio };
	}

	function layout() {
		const pinBox = pin.getBoundingClientRect();
		W = pin.clientWidth;
		H = pin.clientHeight;
		const wide = W >= 768;
		const frame = pageFrame?.getBoundingClientRect();
		const frameLeft = frame ? frame.left - pinBox.left : 20;
		const frameWidth = frame ? frame.width : W - 40;
		const col = Math.min(400, frameWidth * 0.411765);

		// the same 3-line frame the page draws, here so it can fade with the camera
		lines.style.left = `${frameLeft}px`;
		lines.style.width = `${frameWidth}px`;
		lines.style.setProperty("--col", `${col}px`);
		pin.style.setProperty("--cap-left", `${frameLeft + 20}px`);
		pin.style.setProperty("--cap-width", `${wide ? col - 40 : W - 40 - 2 * 20}px`);

		tanHalf = Math.tan(rad(W / H < 1 ? 58 : 40) / 2); // the reference's 40° lens, wider on portrait
		F = H / (2 * tanHalf);
		stage.style.perspective = `${F}px`;
		cell = (DOT_PX * 2 * TOP_H * tanHalf) / H;
		relief = wide ? RELIEF : 0; // phones keep the turn but skip the dunes

		// at each stop the card fills the media column, parallel to the screen so a video never skews
		const pxPerUnit = H / (2 * tanHalf * VIEW_DISTANCE);
		const padding = W >= 1200 ? 60 : 40;
		const x0 = wide ? frameLeft + col + padding : 20;
		const x1 = wide ? frameLeft + frameWidth - padding : W - 20;
		const width = Math.min(x1 - x0, (H - NAV_CLEARANCE * 2) * 1.6);
		const scale = width / (pxPerUnit * PANEL_W);
		const shift = ((x0 + x1) / 2 - W / 2) / pxPerUnit;
		shiftPx = (x0 + x1) / 2 - W / 2;
		wideView = wide;
		const screenPerPx = (scale * pxPerUnit) / PX;
		const hold = panels.map((pa) => {
			const c = onOrbit(pa.yaw, ORBIT.panel, ORBIT.height);
			pa.scale = scale;
			pa.c = [c[0] + shift * Math.cos(pa.yaw), c[1], c[2] - shift * Math.sin(pa.yaw)];
			// the camera frames the first image at arrival and the last one when it leaves
			const first = pa.shots[0];
			const last = pa.shots[pa.shots.length - 1];
			pa.el.style.marginTop = `${-first.offsetHeight / 2}px`;
			pa.el.style.transformOrigin = `50% ${first.offsetHeight / 2}px`;
			const distance = (last.offsetTop - first.offsetTop) * screenPerPx;
			pa.travel = distance / pxPerUnit;
			return distance;
		});
		route = buildRoute(hold, H);
		timeCapChars();
		journey.style.height = `${route.total - route.lead + H}px`;
		const firstShot = panels[0].shots[0];
		firstRatio = firstShot.offsetHeight / firstShot.offsetWidth || firstRatio;
		const farKey = route.K[1].v;
		publishFirst(farKey, basis(farKey[3], farKey[4], 0));
		const px = H / route.total;
		hops.list = route.holds.slice(0, -1).map(([, b], i) => ({
			appear: b - 0.45 * px,
			lift: b - 0.12 * px,
			turn: b + 0.35 * (route.transit / route.total),
			arrive: route.holds[i + 1][0] - 0.01 * px, // a hair before the stop: the scroll may rest a pixel short of it
			end: route.holds[i + 1][1],
		}));

		canvas.width = Math.round(W * quality);
		canvas.height = Math.round(H * quality);
		gl.viewport(0, 0, canvas.width, canvas.height);
	}

	// keyboard: tabbing into a project's link brings the camera to its stop
	caps.forEach((cap, i) => {
		cap.addEventListener("focusin", () => {
			const [a] = route.holds[i];
			const box = journey.getBoundingClientRect();
			scrollTo({ top: scrollY + box.top + a * route.total - route.lead, behavior: "instant" });
		});
	});

	const mouse = { x: 0, y: 0, sx: 0, sy: 0, on: 0, onTarget: 0 };
	addEventListener(
		"pointermove",
		(e) => {
			mouse.x = (e.clientX / innerWidth) * 2 - 1;
			mouse.y = -(e.clientY / innerHeight) * 2 + 1;
			mouse.onTarget = e.pointerType === "mouse" ? 1 : 0;
		},
		{ passive: true },
	);

	let progress = 0;
	let snap = true;
	let lastT = performance.now();
	let frames = 0;
	let slow = 0;
	let raf = 0;

	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - lastT) / 1000);
		lastT = now;

		const box = journey.getBoundingClientRect();
		const target = clamp((route.lead - box.top) / route.total, 0, 1);
		const px = H / route.total; // one screen of scroll, as progress
		// the images scroll like a normal page: the camera's easing only applies while it travels
		let resting = 0;
		route.holds.forEach(([a, b]) => {
			resting = Math.max(resting, sstep(a - 0.2 * px, a - 0.02 * px, target) * (1 - sstep(b + 0.02 * px, b + 0.2 * px, target)));
		});
		progress = snap ? target : progress + (target - progress) * (1 - Math.exp(-dt * (5.5 + 30 * resting)));
		snap = false;
		if (Math.abs(target - progress) < 0.00005) progress = target;

		const v = sample(route.K, progress);
		const ahead = sample(route.K, Math.min(1, progress + 0.006));
		const behind = sample(route.K, Math.max(0, progress - 0.006));
		const pos: Vec3 = [v[0], v[1], v[2]];
		const ground = sstep(rad(-78), rad(-24), v[4]);

		// how far (in progress) the camera is from each project's stop
		const gaps = route.holds.map(([a, b]) => (progress < a ? a - progress : progress > b ? progress - b : 0));

		mouse.sx += (mouse.x - mouse.sx) * (1 - Math.exp(-dt * 2.6));
		mouse.sy += (mouse.y - mouse.sy) * (1 - Math.exp(-dt * 2.6));
		mouse.on += (mouse.onTarget - mouse.on) * (1 - Math.exp(-dt * 2));
		const sway = ground * (1 - resting) * mouse.on;
		const bank = clamp((ahead[3] - behind[3]) * 0.3, -0.03, 0.03) * ground;
		const { f, r, u } = basis(v[3] - mouse.sx * 0.012 * sway, v[4] + mouse.sy * 0.008 * sway, bank * (1 - resting));

		// until the far view it points at where the image will be, not at where it is off screen
		const farKey = route.K[1];
		if (progress < farKey.t) {
			publishFirst(farKey.v, basis(farKey.v[3] - mouse.sx * 0.012 * sway, farKey.v[4] + mouse.sy * 0.008 * sway, 0));
		} else {
			publishFirst(v, { f, r, u });
		}
		hops.progress = progress;
		hops.targets = panels.map((pa, i) => {
			const [a, b] = route.holds[i];
			return onScreen(pa, v, { f, r, u }, pa.travel * clamp((progress - a) / Math.max(b - a, 1e-6), 0, 1));
		});

		// ---- cards ----
		const b: Vec3 = [-f[0], -f[1], -f[2]];
		for (const pa of panels) {
			const [holdA, holdB] = route.holds[pa.i];
			const stopT = clamp((progress - holdA) / Math.max(holdB - holdA, 1e-6), 0, 1);
			const d: Vec3 = [pa.c[0] - pos[0], pa.c[1] + pa.travel * stopT - pos[1], pa.c[2] - pos[2]];
			const depth = dot(d, f);
			// the first project is visible from far away; the others crossfade during the orbit
			const seenFromFar = pa.i === 0 && progress < holdA;
			const transit = route.transit / route.total;
			const focus = seenFromFar ? 1 : 1 - sstep(transit * 0.35, transit * 0.95, gaps[pa.i]);
			const op = sstep(0.8, 2.2, depth) * sstep(0.5, 0.92, ground) * focus;
			// how far along its way in: for the first project from just before the far view, for the others from mid-orbit
			const seenFrom = pa.i ? holdA - 0.6 * transit : farKey.t - 0.25 * px;
			const coming = clamp((progress - seenFrom) / Math.max(holdA - seenFrom, 1e-6), 0, 1);
			const light = sstep(COMING.lightFrom, COMING.lightTo, coming);
			if (depth < 0.7 || op < 0.005) {
				pa.el.style.visibility = "hidden";
				continue;
			}
			const cos = Math.cos(pa.yaw);
			const sin = Math.sin(pa.yaw);
			const ex: Vec3 = [cos * pa.scale, 0, -sin * pa.scale];
			const ey: Vec3 = [0, -pa.scale, 0]; // the element's y runs down
			const ez: Vec3 = [sin, 0, cos];
			const m = [
				dot(ex, r), -dot(ex, u), dot(ex, b), 0,
				dot(ey, r), -dot(ey, u), dot(ey, b), 0,
				dot(ez, r), -dot(ez, u), dot(ez, b), 0,
				dot(d, r) * PX, -dot(d, u) * PX, dot(d, b) * PX + F, 1,
			];
			pa.el.style.visibility = "visible";
			pa.el.style.opacity = op.toFixed(3);
			pa.el.style.pointerEvents = op > 0.9 ? "auto" : "none";
			pa.el.style.zIndex = String(1000 - Math.round(depth * 20));
			pa.el.style.transform = `matrix3d(${m.map((n) => n.toFixed(5)).join(",")})`;

			// in flight a project is one image: the first on the way in, the last on the way out
			const arrived = sstep(holdA - 0.25 * px, holdA - 0.02 * px, progress);
			const staying = 1 - sstep(holdB + 0.02 * px, holdB + 0.25 * px, progress);
			pa.shots.forEach((shot, j) => {
				const o = (j === 0 ? COMING.faint + (1 - COMING.faint) * sstep(0, COMING.showTo, coming) : arrived) * (j === pa.shots.length - 1 ? 1 : staying);
				shot.style.opacity = o.toFixed(3);
				// the whole image at once, no zones. In steps, so the filter only re-renders when it changes
				const step = j === 0 ? Math.round(light * QUANTIZE) / QUANTIZE : 1;
				setStyleFilter(
					shot,
					step < 1
						? `brightness(${(COMING.dark + (1 - COMING.dark) * step).toFixed(3)}) saturate(${(COMING.grey + (1 - COMING.grey) * step).toFixed(3)})`
						: "",
					applied,
				);
			});
		}

		// the text shows from far away, next to the images and at their scale, and settles in the top-left corner
		// at the stop. Scrolling plays the headline's entrance through it, letter by letter; it leaves when the
		// camera starts to move on
		route.holds.forEach(([a, b], i) => {
			const cap = caps[i];
			const from = i ? a - 0.6 * (route.transit / route.total) : route.K[1].t - 0.12 * px;
			const n = clamp((progress - from) / Math.max(a - from, 1e-6), 0, 1);
			const out = 1 - sstep(b + 0.02 * px, b + 0.2 * px, progress);
			const far = 1 - sstep(0.35, 0.95, n); // in the haze of the distance
			cap.style.opacity = (sstep(0, 0.05, n) * (1 - 0.4 * far) * out).toFixed(3);
			cap.style.pointerEvents = n * out > 0.9 ? "auto" : "none";
			if (n > 0 && n < 1 && wideView) {
				// same offset from the images as at the stop, at the scale they have from here
				const pa = panels[i];
				const d: Vec3 = [pa.c[0] - pos[0], pa.c[1] - pos[1], pa.c[2] - pos[2]];
				const depth = Math.max(dot(d, f), 0.7);
				const unit = F / depth;
				const size = Math.min(1, VIEW_DISTANCE / depth);
				const cx = W / 2 + dot(d, r) * unit;
				const cy = H / 2 - dot(d, u) * unit;
				const tx = cx + (cap.offsetLeft - (W / 2 + shiftPx)) * size - cap.offsetLeft;
				const ty = cy + (cap.offsetTop - H / 2) * size - cap.offsetTop;
				cap.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${size.toFixed(4)})`;
			} else if (capSeen[i] !== n) {
				cap.style.transform = "";
			}
			const soft = n > 0 && out > 0 ? Math.round(Math.max(far, 1 - out) * QUANTIZE) / QUANTIZE : 0;
			setStyleFilter(cap, soft ? `blur(${(soft * CAPTION_BLUR).toFixed(2)}px)` : "", applied);
			if (capSeen[i] === n) return;
			capSeen[i] = n;
			const written = n / CAP_LETTERS_END;
			capChars[i].forEach((ch) => {
				const [start, end] = charTimes.get(ch) ?? [0, 1];
				const o = sstep(start, end, written);
				ch.style.opacity = o.toFixed(3);
				ch.style.transform = o < 1 ? `translateY(${((1 - o) * 10).toFixed(1)}px)` : "";
				ch.style.filter = o > 0 && o < 1 ? `blur(${((1 - o) * 10).toFixed(2)}px)` : "";
			});
			const m = sstep(CAP_META_FROM, 1, n);
			capMeta[i].style.opacity = m.toFixed(3);
			capMeta[i].style.transform = m < 1 ? `translateY(${((1 - m) * 16).toFixed(1)}px)` : "";
		});

		lines.style.opacity = (1 - ground).toFixed(3);

		// ---- dots ----
		gl.uniform2f(U.uRes, canvas.width, canvas.height);
		gl.uniform3f(U.uPos, pos[0], pos[1], pos[2]);
		gl.uniform3fv(U.uR, r);
		gl.uniform3fv(U.uU, u);
		gl.uniform3fv(U.uF, f);
		gl.uniform1f(U.uTan, tanHalf);
		gl.uniform1f(U.uAspect, W / H);
		gl.uniform1f(U.uTime, now / 1000);
		gl.uniform1f(U.uAmp, relief * ground);
		gl.uniform1f(U.uCell, cell);
		gl.uniform1f(U.uGround, ground);
		gl.uniform1f(U.uVis, 1 - resting);
		gl.uniform1f(U.uEdgeTop, sstep(0, 40, box.top));
		gl.uniform1f(U.uEdgeBottom, 1 - sstep(0, 40, box.bottom - H));
		gl.uniform1f(U.uScale, quality);
		const aspect = W / H;
		const rd = [0, 1, 2].map((c) => r[c] * mouse.x * tanHalf * aspect + u[c] * mouse.y * tanHalf + f[c]);
		const hit = rd[1] < -0.02 ? pos[1] / -rd[1] : 0;
		gl.uniform3f(U.uPtr, pos[0] + rd[0] * hit, pos[2] + rd[2] * hit, hit ? 0.5 * mouse.on : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// adaptive quality: lower the field's resolution if the device can't keep up
		frames++;
		if (dt > 0.03) slow++;
		if (frames >= 90) {
			if (slow > 40 && quality > 0.6) {
				quality = Math.max(0.6, quality * 0.8);
				layout();
			}
			frames = 0;
			slow = 0;
		}
	}

	// the images' size sets how long each stop lasts, so a change in either re-times the journey
	const resizes = new ResizeObserver(layout);
	resizes.observe(pin);
	panels.forEach((pa) => resizes.observe(pa.el));
	layout();
	document.fonts?.ready.then(timeCapChars); // the real font can wrap the text differently

	// only runs while the section is on screen
	new IntersectionObserver(
		([entry]) => {
			cancelAnimationFrame(raf);
			raf = 0;
			if (entry.isIntersecting) {
				snap = true;
				lastT = performance.now();
				raf = requestAnimationFrame(frame);
			}
		},
		{ rootMargin: "200px 0px" },
	).observe(journey);
}

const journey = document.querySelector<HTMLElement>("[data-journey]");
if (journey?.classList.contains("is-3d")) start(journey);
