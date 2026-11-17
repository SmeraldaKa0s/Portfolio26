// The footer's garden: 3D plants drawn as a fine character grid, the glyphs reading as grain. Each cell
// carries its own grey from one key light plus a rim on the faces that turn away; a petal passing over
// another leaves the one behind in shadow (no outlines), and glyphs follow the surface where it turns.
// Plants grow along a hand-drawn silhouette around the CTA and move only when touched; now and then one
// closes its petals and opens them again; a small version of the hero's butterfly goes from flower to
// flower. The grass is drawn by the halftone background (HalftoneBackground.astro), which reads
// window.gardenZone.
const S = {
	cw: 3.25, ch: 4.35, font: 4.4, // cell and glyph, CSS px
	n: 22, size: 1.75, min: 46, dens: 1.3, // plants, bloom scale, smallest bloom radius (px), point density
	amb: 0.1, rim: 0.45, cup: 0.5, ao: 0.3, contact: 0.4, edgeBoost: 1.2, exp: 2.8, // light
	ruffle: 0.16, // wavy petal margins
	kinds: ["lisianthus", "papaver", "tulipa", "nelumbo", "zantedeschia", "osteospermum"],
};

export function startGarden(canvas, section) {
	const ctx = canvas.getContext("2d");
	const glow = document.createElement("canvas");
	const gctx = glow.getContext("2d");
	const textEl = section.querySelector(".cta__text");
	const buttonEl = section.querySelector(".cta__hi");
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

	const MONO = getComputedStyle(document.documentElement).getPropertyValue("--font-mono");
	const FONT = `400 ${S.font}px ${MONO}`;
	const CW = S.cw; // character cell, CSS px
	const CH = S.ch;
	const LABEL_FONT = `400 9px ${MONO}`;

	const DIST = 2.8; // close camera: strong perspective
	const PITCH = 0.32;
	const YAW = 0.22;
	const ZEPS = 0.035; // points this much behind the nearest one in a cell are hidden
	const TAU = Math.PI * 2;
	const LIGHT = norm([-0.5, 0.7, -0.55]); // upper front left
	const STEM_END = 0.5;
	const GROW = 5;
	// glyph layers by light: lit surfaces in round digits, mid tones in the other digits,
	// shadows hatched along the petal or leaf, outlines in lines that follow the edge
	const LIT = "0896";
	const MID = "1234570";
	const DUST = ["0", "1", "7", ".", "·", "8"];

	const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

	// Grafito: pure greys. Species stay apart by value: lily and calla near white, sunflower and daisy mid
	// grey with a dark center, poppy and iris dark with a light one. species: [petal, center]
	const pal = {
		species: {
			papaver: ["#8c8c8c", "#f2f2f2"], lilium: ["#f6f6f6", "#9a9a9a"], helianthus: ["#cfcfcf", "#3c3c3c"],
			zantedeschia: ["#e4e4e4", "#ffffff"], osteospermum: ["#b4b4b4", "#2e2e2e"], iris: ["#727272", "#efefef"],
			tulipa: ["#c8c8c8", "#4e4e4e"], nelumbo: ["#bcbcbc", "#f0f0f0"], lisianthus: ["#d6d6d6", "#7a7a7a"],
		},
		dark: "#2a2a2a", accent: "#d8d8d8", stem: "#8f8f8f", leaf: "#6b6b6b", rib: "#bdbdbd", label: [200, 200, 200],
	};

	// the garden keeps the same gap from the dashed lines on both sides and from the links row below
	let PAD = 40;
	let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, k = 1, halfW = 1, groundY = 0, floorY = 0;
	let R, G, B, A, Zb, EX, EY, EW, HX, HY, FV, BL;
	let curFacing = 1, curBloom = 0; // set by whoever splats: how much the surface faces us, 1 on a bloom
	let plants = [];
	let dust = [];
	let startAt = null;
	let visible = false;
	let raf = 0;
	let rand = Math.random;
	let hover = null;
	let clearBoxes = [];
	let textAvoid = []; // where the butterfly may not fly: over the words
	let nextShut = 10;

	function rng(seed) {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function norm(v) {
		const l = Math.hypot(v[0], v[1], v[2]) || 1;
		return [v[0] / l, v[1] / l, v[2] / l];
	}

	const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
	const ease = (t) => 1 - Math.pow(1 - t, 3);
	const lerp = (a, b, t) => a + (b - a) * t;
	const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
	const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
	const bell = (u, p, q) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(clamp(u), p))), q);
	const ZERO = [0, 0, 0];
	const sstep = (a, b, x) => {
		const t = clamp((x - a) / (b - a));
		return t * t * (3 - 2 * t);
	};

	// The silhouette the garden fills (the blue line): for each share of the width, how high the blooms
	// may reach, as a share of the height. A peak on the left, a slope down into the low strip under the
	// button, and a wide plateau on the right; nothing past the dashed frame lines.
	const PROFILE = [
		[0.025, 0.5], [0.045, 0.41], [0.09, 0.39], [0.12, 0.36], [0.17, 0.38], [0.21, 0.46], [0.26, 0.56], [0.31, 0.66], [0.35, 0.72],
		[0.5, 0.75], [0.64, 0.73], [0.68, 0.68], [0.72, 0.56], [0.76, 0.44], [0.8, 0.39], [0.86, 0.37], [0.91, 0.38], [0.955, 0.41], [0.975, 0.5],
	];
	function topAt(fx) {
		if (fx <= PROFILE[0][0]) return 1;
		for (let i = 1; i < PROFILE.length; i++) {
			const [x1, y1] = PROFILE[i], [x0, y0] = PROFILE[i - 1];
			if (fx <= x1) return lerp(y0, y1, sstep(x0, x1, fx));
		}
		return 1;
	}
	// 0 where the silhouette is lowest, 1 at its peaks
	const tallness = (fx) => clamp((0.78 - topAt(fx)) / 0.42);
	// where grass grows and how tall (the halftone grass reads it through window.gardenZone)
	const ZONE = (fx) => {
		const p = PAD / W;
		return sstep(p, p + 0.025, fx) * (1 - sstep(1 - p - 0.025, 1 - p, fx)) * (0.35 + 0.65 * tallness(fx));
	};
	let dens = 1;
	const only = (l) => (l.filter((kd) => S.kinds.includes(kd)).length ? l.filter((kd) => S.kinds.includes(kd)) : S.kinds);
	const LOW = only(["osteospermum", "papaver", "zantedeschia", "iris", "tulipa"]);
	const FRONT = only(["osteospermum", "papaver", "zantedeschia", "iris", "lilium", "tulipa"]);
	let clock = 0; // seconds, for the butterfly's colors
	let presence = 1; // how strongly the plant being drawn shows

	// "Capas": about 34 plants that may overlap, as long as the overlapping blooms contrast (one bright and
	// one faint, or one well behind the other)
	// Fewer, larger blooms: at this font a flower needs room for its petals' outlines to read as a flower
	// rather than a pile of glyphs.
	const prop = { seed: 52, n: S.n, size: S.size, loose: true };
	// below this on-screen size (px, about a bloom's radius) a flower stops reading as a shaded 3D shape
	// and turns into a blot of glyphs, so no bloom is drawn smaller
	const MIN_BLOOM_PX = S.min;

	// ---------- bloom geometry ----------
	// 17 floats a point, in the bloom's frame (+Y is where it faces): open position, bud position, normal,
	// grain (the direction the surface runs, for hatching and outlines), color, weight, 1 on an edge

	function pushPoint(P, p, n, t, c, w, edge = 0) {
		const r = Math.hypot(p[0], p[2]);
		P.push(p[0], p[1], p[2], p[0] * 0.18, p[1] * 0.35 + r * 0.6, p[2] * 0.18, n[0], n[1], n[2], t[0], t[1], t[2], c[0], c[1], c[2], w, edge === 2 ? 2 : edge ? 1 : 0);
	}

	function surface(P, pos, col, edges, fill) {
		// pos(u, v) -> [x, y, z] or null; normals and grain come from finite differences
		const put = (u, v, w, edge) => {
			const p = pos(u, v);
			if (!p) return;
			const pu = pos(u - 0.02, v) || p, pv = pos(u, v + 0.05) || pos(u, v - 0.05) || p;
			const du = sub(p, pu);
			let n = norm(cross(du, sub(pv, p)));
			// outward, away from the bloom's axis, so the inside of a cup can be told from its outside
			if (n[0] * p[0] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
			pushPoint(P, p, n, norm(du), col(u, v), w, edge);
		};
		for (const [u, v] of edges) put(u, v, 1, true);
		for (const [u, v] of fill) put(u, v, 0.5, false);
	}

	function petal(P, o) {
		const ca = Math.cos(o.a), sa = Math.sin(o.a), r0 = o.r0 || 0, cup = o.cup || 0;
		const pos = (u, v) => {
			const half = o.wid * o.shape(u);
			if (half <= 0.0005) return null;
			const ang = o.tilt + o.curl * u * 0.5, along = u * o.len;
			let rad = r0 + along * Math.sin(ang), up = along * Math.cos(ang) + cup * v * v * half, lat = v * half;
			// a wavy margin, stronger toward the tip
			const ruf = o.ruffle ?? S.ruffle;
			if (ruf) {
				const wv = Math.sin(v * Math.PI * 2.5 + o.a * 3 + u * 4) * ruf * half * u * u * Math.abs(v);
				up += wv;
				rad += wv * 0.4;
			}
			return [rad * ca - lat * sa, up, rad * sa + lat * ca];
		};
		const edges = [], fill = [];
		const ne = Math.round(o.edge * dens);
		for (let e = 0; e < ne; e++) {
			const u = (e + 0.5) / ne;
			edges.push([u, -1], [u, 1]);
		}
		// dense enough that a petal reads as a solid surface of glyphs
		const fu = Math.max(3, Math.round(o.fu * 2 * dens)), fv = Math.max(2, Math.ceil(o.fv * 2.2 * dens));
		for (let i = 0; i < fu; i++) for (let j = 0; j < fv; j++) fill.push([(i + 0.3 + rand() * 0.4) / fu, ((j + 0.5) / fv) * 2 - 1]);
		surface(P, pos, o.col, edges, fill);
	}

	function disc(P, radius, n, col, dome, w = 0.9) {
		for (let i = 0; i < n; i++) {
			const f = Math.sqrt((i + 0.5) / n), a = i * 2.39996;
			pushPoint(P, [Math.cos(a) * radius * f, dome * (1 - f * f), Math.sin(a) * radius * f], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)], col(f), w, 2);
		}
	}

	function line(P, from, to, n, c, w) {
		const t = norm(sub(to, from));
		for (let i = 0; i <= n; i++) pushPoint(P, mix(from, to, i / n), [0, 0, -1], t, c, w, 1);
	}

	// C: main, dark, center, accent, stem (rgb arrays from the palette)
	const SPECIES = {
		papaver: {
			name: "PAPAVER", heads: [1, 3], height: [0.5, 0.8], size: [0.13, 0.17], face: 0.55, curve: 0.12, leaves: "lobed",
			bloom(P, C) {
				const n = rand() < 0.4 ? 5 : 4, off = rand() * TAU;
				for (let i = 0; i < n; i++)
					petal(P, { a: off + (i / n) * TAU + (rand() - 0.5) * 0.3, tilt: 0.62, curl: -0.3, len: 1, wid: 0.62, cup: 0.45,
						shape: (u) => bell(0.12 + u * 0.88, 1, 0.5), col: (u) => mix(C.dark, C.main, clamp(u / 0.3)), edge: 26, fu: 14, fv: 10 });
				disc(P, 0.13, 40, () => C.center, 0.14, 1.3);
				for (let i = 0; i < 28; i++) {
					const a = (i / 28) * TAU, r = 0.17 + rand() * 0.06;
					pushPoint(P, [Math.cos(a) * r, 0.08 + rand() * 0.05, Math.sin(a) * r], [0, 1, 0], ZERO, mix(C.dark, C.accent, 0.5), 0.9);
				}
			},
		},
		lilium: {
			name: "LILIUM", heads: [1, 2], height: [0.85, 1.1], size: [0.12, 0.15], face: 1.05, curve: 0.04, leaves: "whorl",
			bloom(P, C) {
				const off = rand() * TAU;
				for (let i = 0; i < 6; i++)
					petal(P, { a: off + (i / 6) * TAU, tilt: 0.75, curl: 1.5, len: 1, wid: 0.2, cup: 0.3,
						shape: (u) => bell(u, 0.75, 0.9), col: (u) => mix(C.accent, C.main, clamp(u / 0.45)), edge: 24, fu: 12, fv: 4 });
				for (let i = 0; i < 6; i++) {
					const a = off + (i / 6) * TAU + 0.5, to = [Math.cos(a) * 0.32, 0.72, Math.sin(a) * 0.32];
					line(P, [0, 0, 0], to, 10, C.stem, 0.8);
					for (let j = 0; j < 5; j++)
						pushPoint(P, [to[0] + (rand() - 0.5) * 0.05, to[1] + (rand() - 0.5) * 0.04, to[2] + (rand() - 0.5) * 0.05], [0, 1, 0], ZERO, C.center, 1.6);
				}
			},
		},
		helianthus: {
			name: "HELIANTHUS", heads: [1, 1], height: [0.8, 1.05], size: [0.11, 0.14], face: 1.2, curve: 0.05, leaves: "heart",
			bloom(P, C) {
				disc(P, 0.32, 300, (f) => mix(C.dark, C.center, f), 0.05, 1);
				const n = 14, off = rand() * TAU, bi = rand() < 0.4;
				for (let i = 0; i < n; i++)
					petal(P, { a: off + (i / n) * TAU, r0: 0.3, tilt: 1.42, curl: 0.15, len: 0.5, wid: 0.24, cup: 0.2,
						shape: (u) => bell(u, 0.7, 0.7), col: (u) => (bi ? mix(C.dark, C.main, clamp(u / 0.5)) : C.main), edge: 8, fu: 6, fv: 3 });
			},
		},
		zantedeschia: {
			name: "ZANTEDESCHIA", heads: [1, 1], height: [0.5, 0.72], size: [0.12, 0.14], face: 0.6, curve: 0.03, leaves: "arrow",
			bloom(P, C) {
				// one spathe rolled into a funnel, its lip flaring out at the back
				const pos = (u, v) => {
					if (u < 0 || u > 1) return null;
					const ang = v * 2.75;
					const flare = 0.22 * Math.pow(u, 3) * (1 + Math.cos(ang)) * 0.5;
					const r = 0.05 + 0.4 * Math.pow(u, 1.6) + flare;
					return [Math.sin(ang) * r, u * 1.05 - flare * 0.5, Math.cos(ang) * r];
				};
				const edges = [], fill = [];
				for (let e = 0; e < 30; e++) edges.push([(e + 0.5) / 30, -1], [(e + 0.5) / 30, 1]);
				for (let e = 0; e < 40; e++) edges.push([0.999, (e / 39) * 2 - 1]);
				const fu = Math.round(36 * dens), fv = Math.round(44 * dens);
				for (let i = 0; i < fu; i++) for (let j = 0; j < fv; j++) fill.push([(i + 0.5) / fu, ((j + 0.5) / fv) * 2 - 1]);
				surface(P, pos, (u) => mix(C.stem, C.main, clamp(u / 0.3)), edges, fill);
				line(P, [0, 0.05, 0], [0, 0.6, 0.03], 16, C.center, 1.6);
			},
		},
		osteospermum: {
			name: "OSTEOSPERMUM", heads: [1, 2], height: [0.35, 0.55], size: [0.12, 0.15], face: 0.6, curve: 0.08, leaves: "narrow",
			// a dark eye, petals that start dark and light up toward the tip, every other one a shade darker,
			// so the petals read apart instead of one bright patch
			bloom(P, C) {
				disc(P, 0.17, 70, (f) => mix(C.center, C.stem, f * 0.5), 0.08, 1.2);
				const n = 10, off = rand() * TAU;
				for (let i = 0; i < n; i++) {
					const tip = i % 2 ? C.main : mix(C.main, C.dark, 0.35);
					petal(P, { a: off + (i / n) * TAU, r0: 0.12, tilt: 1.3, curl: 0.25, len: 0.78, wid: 0.2, cup: 0.3,
						shape: (u) => bell(u, 0.55, 0.6), col: (u) => mix(C.dark, tip, clamp((u - 0.05) / 0.55)), edge: 12, fu: 8, fv: 3 });
				}
			},
		},
		tulipa: {
			name: "TULIPA", heads: [1, 1], height: [0.6, 0.9], size: [0.12, 0.15], face: 0.35, curve: 0.04, leaves: "blade",
			// a cup of six broad petals in two rings, curving in at the top: few large faces with clear folds,
			// the inner ring a little darker
			bloom(P, C) {
				const off = rand() * TAU;
				for (let ring = 0; ring < 2; ring++)
					for (let i = 0; i < 3; i++)
						petal(P, { a: off + (i / 3) * TAU + ring * (TAU / 6), r0: 0.04, tilt: ring ? 0.42 : 0.3, curl: -0.55, len: 1.15 - ring * 0.08, wid: 0.62, cup: 0.55,
							shape: (u) => bell(u, 0.75, 0.42), col: (u) => mix(C.dark, ring ? mix(C.main, C.center, 0.25) : C.main, clamp(u / 0.35)), edge: 30, fu: 16, fv: 12 });
			},
		},
		nelumbo: {
			name: "NELUMBO", heads: [1, 1], height: [0.6, 0.85], size: [0.13, 0.16], face: 0.7, curve: 0.04, leaves: "heart",
			// lotus: two rings of broad cupped petals around a bright domed center
			bloom(P, C) {
				const off = rand() * TAU;
				for (let ring = 0; ring < 2; ring++) {
					const n = ring ? 7 : 9;
					for (let i = 0; i < n; i++)
						petal(P, { a: off + (i / n) * TAU + ring * 0.35, r0: 0.1, tilt: ring ? 0.5 : 0.95, curl: -0.35, len: ring ? 0.8 : 1, wid: 0.4, cup: 0.6,
							shape: (u) => bell(u, 0.7, 0.55), col: (u) => mix(C.dark, ring ? mix(C.main, [255, 255, 255], 0.15) : C.main, clamp(u / 0.4)), edge: 22, fu: 12, fv: 8 });
				}
				disc(P, 0.16, 90, (f) => mix(C.center, C.accent, f), 0.12, 1.4);
			},
		},
		lisianthus: {
			name: "LISIANTHUS", heads: [1, 2], height: [0.7, 0.95], size: [0.13, 0.16], face: 0.6, curve: 0.06, leaves: "narrow",
			// three layers of five broad ruffled petals, the inner ones closing into a cup
			bloom(P, C) {
				const off = rand() * TAU;
				for (let L = 0; L < 3; L++)
					for (let i = 0; i < 5; i++)
						petal(P, { a: off + (i / 5) * TAU + L * 0.6, r0: 0.03, tilt: [0.35, 0.62, 0.95][L], curl: [-0.45, -0.1, 0.3][L], len: [0.7, 0.9, 1][L], wid: 0.55, cup: 0.7,
							shape: (u) => bell(u, 0.8, 0.5), col: (u) => mix(C.dark, L ? C.main : mix(C.main, C.dark, 0.25), clamp(u / 0.45)), edge: 28, fu: 14, fv: 10, ruffle: 0.2 });
				disc(P, 0.06, 20, () => C.center, 0.2, 1);
			},
		},
		iris: {
			name: "IRIS", heads: [1, 1], height: [0.6, 0.85], size: [0.13, 0.16], face: 0.25, curve: 0.02, leaves: "sword",
			bloom(P, C) {
				const off = rand() * TAU, light = mix(C.main, [255, 255, 255], 0.35);
				for (let i = 0; i < 3; i++) {
					const a = off + (i / 3) * TAU;
					petal(P, { a, tilt: 0.28, curl: -0.4, len: 0.9, wid: 0.38, cup: 0.4, shape: (u) => bell(u, 0.8, 0.6), col: () => light, edge: 20, fu: 12, fv: 7 });
					petal(P, { a: a + TAU / 6, tilt: 1.0, curl: 1.6, len: 1, wid: 0.42, cup: 0.3, shape: (u) => bell(u, 0.9, 0.6),
						col: (u, v) => (Math.abs(v) < 0.22 && u < 0.6 ? C.center : C.main), edge: 22, fu: 12, fv: 8 });
				}
			},
		},
	};

	// ---------- leaves: folded along the midrib so each side catches the light differently ----------
	// 14 floats a point: position, normal, grain, color, weight, 1 on an edge

	function leaf(o, C) {
		const P = [];
		const N = (o.n || 22) * 2, step = o.len / N;
		const ca = Math.cos(o.az), sa = Math.sin(o.az);
		const roll = o.roll ?? (rand() - 0.5) * 0.9;
		const lat = [-sa * Math.cos(roll), Math.sin(roll), ca * Math.cos(roll)];
		const put = (p, n, t, c, w, edge = 1) => P.push(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1], t[2], c[0], c[1], c[2], w, edge);
		let x = 0, y = 0, z = 0;
		for (let i = 0; i <= N; i++) {
			const u = i / N, e = o.elev - o.droop * u;
			const d = [ca * Math.cos(e), Math.sin(e), sa * Math.cos(e)];
			if (i) {
				x += d[0] * step;
				y += d[1] * step;
				z += d[2] * step;
			}
			let n = norm(cross(d, lat));
			if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
			const half = o.wid * o.shape(u);
			put([x, y, z], n, d, C.rib, 0.8);
			if (half < 0.002) continue;
			const at = (v) => {
				const f = Math.abs(v) * half * 0.35; // the fold
				return [x + lat[0] * half * v + n[0] * f, y + lat[1] * half * v + n[1] * f, z + lat[2] * half * v + n[2] * f];
			};
			for (const v of [-1, 1]) put(at(v), norm(sub(n, lat.map((l) => l * v * 0.6))), d, mix(C.leaf, C.rib, 0.35), 1);
			for (let j = 0, fv = o.fv * 2; j < fv; j++) {
				const v = ((j + 0.5) / fv) * 2 - 1;
				// veins run out from the midrib toward the tip
				put(at(v), norm(sub(n, lat.map((l) => l * v * 0.6))), norm(d.map((x, q) => x + lat[q] * v * 0.7)), C.leaf, 0.5, 0);
			}
		}
		return { t: o.t, pts: new Float32Array(P), a: 0, v: 0, gain: 0.6 + rand() * 0.9, tip: [x, y, z] };
	}

	const LEAVES = {
		lobed: (sc, h, C) => Array.from({ length: 2 }, (_, i) =>
			leaf({ t: 0.08 + i * 0.13, az: rand() * TAU, elev: 0.7, droop: 1.1, len: 0.2 * sc, wid: 0.06 * sc, fv: 5,
				shape: (u) => bell(u, 1, 0.6) * (0.5 + 0.5 * Math.abs(Math.sin(u * Math.PI * 4))) }, C)),
		whorl: (sc, h, C) => Array.from({ length: 7 }, (_, i) =>
			leaf({ t: 0.12 + i * 0.09, az: i * 2.4, elev: 0.45, droop: 0.7, len: 0.16 * sc, wid: 0.03 * sc, fv: 2, shape: (u) => bell(u, 0.8, 1) }, C)),
		heart: (sc, h, C) => [0, 1].map((i) =>
			leaf({ t: 0.25 + i * 0.2, az: i * 2.6 + rand(), elev: 0.35, droop: 1.1, len: 0.17 * sc, wid: 0.08 * sc, fv: 6, shape: (u) => bell(u, 0.5, 0.8) }, C)),
		arrow: (sc, h, C) => [0].map(() =>
			leaf({ t: 0, az: 0.6 + rand() * 2, elev: 1.25, droop: 1.7, len: 0.3 * sc, wid: 0.09 * sc, fv: 6, n: 28,
				shape: (u) => (u < 0.45 ? 0 : bell((u - 0.45) / 0.55, 0.5, 0.8)) }, C)),
		narrow: (sc, h, C) => [0, 1, 2, 3].map((i) =>
			leaf({ t: 0.04 + i * 0.07, az: i * 1.9 + rand(), elev: 0.5, droop: 0.8, len: 0.14 * sc, wid: 0.028 * sc, fv: 2, shape: (u) => bell(u, 0.7, 1) }, C)),
		blade: (sc, h, C) => [0, 1].map((i) =>
			leaf({ t: 0.04 + i * 0.1, az: i * Math.PI + rand() * 0.8, elev: 1.05, droop: 0.9, len: Math.min(0.42, h * 0.55) * sc, wid: 0.06 * sc, fv: 4, n: 26,
				shape: (u) => bell(u, 0.6, 0.7) }, C)),
		sword: (sc, h, C) => [0, 1, 2, 3].map((i) =>
			leaf({ t: 0, az: i * 1.6 + rand() * 0.5, elev: 1.42 - i * 0.08, droop: 0.3 + i * 0.12, len: h * (0.55 + rand() * 0.2), wid: 0.038 * sc,
				fv: 2, n: 28, roll: 1.1, shape: (u) => bell(u, 0.35, 0.5) }, C)),
	};

	// ---------- garden ----------

	function basis(axis) {
		const n = norm(axis);
		const t1 = norm([1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]);
		return { n, t1, t2: cross(n, t1) };
	}

	function colors(kind) {
		const [main, center] = pal.species[kind];
		return { main: hex(main), center: hex(center), dark: hex(pal.dark), accent: hex(pal.accent), stem: hex(pal.stem), leaf: hex(pal.leaf), rib: hex(pal.rib) };
	}

	function makePlant(spec, kind, idx) {
		const sp = SPECIES[kind];
		const C = colors(kind);
		const sc = 0.7 + rand() * 0.4;
		const h = spec.h ?? lerp(sp.height[0], sp.height[1], rand()) * spec.hMul * (0.85 + 0.2 * sc);
		// most plants stay faint so the garden reads as a whole; a few stand out
		const featured = rand() < 0.3;
		// a short plant gets one flower, small enough to leave a stem in view: a bloom sitting on the
		// ground with nothing under it reads as a blot, not as a plant
		const short = h < 0.34;
		const nHeads = short ? 1 : sp.heads[0] + Math.floor(rand() * (sp.heads[1] - sp.heads[0] + 1));
		const minSize = (spec.minPx ?? MIN_BLOOM_PX) / (k * 0.85); // 0.85: the farthest row's perspective
		const stems = [];
		for (let s = 0; s < nHeads; s++) {
			const dx = nHeads === 1 ? (rand() - 0.5) * 0.06 : (s - (nHeads - 1) / 2) * 0.12 * sc + (rand() - 0.5) * 0.04;
			let hh = h * (s ? 0.72 + rand() * 0.22 : 1);
			const dz = (rand() - 0.5) * 0.2;
			const bend = (rand() < 0.5 ? -1 : 1) * sp.curve;
			// never below the size where it still reads as a flower
			let size = Math.max(minSize, lerp(sp.size[0], sp.size[1], rand()) * sc * (s ? 0.85 : 1) * 1.1 * (spec.sizeMul ?? 1));
			if (short) {
				const ratio = spec.stemRatio ?? 3.2; // stem at least this many bloom radii tall
				size = Math.min(size, Math.max(minSize, hh / ratio));
				hh = Math.max(hh, size * ratio);
			}
			// a larger bloom gets more points, so its petals stay solid and its outlines unbroken
			dens = S.dens;
			const P = [];
			sp.bloom(P, C);
			const face = sp.face + (rand() - 0.5) * 0.3;
			stems.push({
				head: [spec.x + dx * 2, hh, spec.z + dz],
				ctrl: [spec.x + dx * 0.3 + bend, hh * 0.55, spec.z + dz * 0.2],
				lean: (-Math.atan2(dx * 2, hh) * 180) / Math.PI,
				delay: s * 0.35 + rand() * 0.2,
				size,
				basis: basis([Math.sign(dx || 1) * 0.5 * Math.sin(face), Math.cos(face), -Math.sin(face) * 0.85]),
				pts: new Float32Array(P),
				headNow: [0, 0, 0],
			});
		}
		return {
			id: 11 + ((idx * 37) % 89), name: SPECIES[kind].name, C, base: [spec.x, 0, spec.z], stems,
			h: Math.max(...stems.map((st) => st.head[1])),
			iri: 0, iriT: 0, // the butterfly's colors: how strong now, and where they're heading
			shut: 0, shutT: 0, shutHold: 0, // closing its petals: how far now, where it's heading, how long it stays shut
			leaves: LEAVES[sp.leaves](Math.max(sc, 0.9), h, C), // small leaves turn into noise too
			kind, spec, idx, age: -spec.delay, state: "grow", rate: 1, quiet: false,
			featured, presence: featured ? 0.95 : 0.4 + rand() * 0.2,
			bend: 0, bendV: 0, wob: 0, wobV: 0, cool: 0, growth: 0, hit: [],
		};
	}

	function shiftPlant(plant, dx) {
		plant.base[0] += dx;
		for (const st of plant.stems) {
			st.head[0] += dx;
			st.ctrl[0] += dx;
		}
	}

	// how far a plant reaches on screen, left and right (px)
	function extent(plant) {
		let lo = Infinity, hi = -Infinity;
		for (const st of plant.stems) {
			project(...st.head);
			const r = st.size * 1.3 * k * out[2];
			lo = Math.min(lo, out[0] - r);
			hi = Math.max(hi, out[0] + r);
		}
		project(...plant.base);
		return [Math.min(lo, out[0] - 0.15 * k), Math.max(hi, out[0] + 0.15 * k)];
	}

	// the leftmost and rightmost glyph of the garden fully grown (px)
	function drawnSpan() {
		const saved = plants.map((p) => [p.age, p.state]);
		for (const p of plants) {
			p.age = 99;
			p.state = "alive";
		}
		simulate(99, 0);
		plants.forEach((p, i) => ([p.age, p.state] = saved[i]));
		let lo = cols, hi = -1;
		const r1 = Math.floor(floorY / CH);
		for (let i = 0; i < r1 * cols; i++)
			if (A[i] >= 0.06) {
				lo = Math.min(lo, i % cols);
				hi = Math.max(hi, i % cols);
			}
		return [lo * CW, (hi + 1) * CW];
	}

	// keep every plant clear of the heading and the button, shrinking it first and moving it out if that is not enough
	// (false when it can't be done: on a narrow screen there may be no room beside the button)
	function keepClear(plant, boxes) {
		const shift = (dx) => shiftPlant(plant, dx);
		const hits = (shrink) => {
			let hit = false;
			for (const st of plant.stems) {
				project(...st.head);
				const hx = out[0], hy = out[1], r = st.size * 1.25 * k * out[2];
				project(...plant.base);
				const l = Math.min(hx, out[0]) - r, rr = Math.max(hx, out[0]) + r, top = hy - r;
				if (boxes.some((b) => rr > b.l && l < b.r && top < b.b)) {
					hit = true;
					if (shrink && st.head[1] > 0.24) {
						st.head[1] *= 0.93;
						st.ctrl[1] *= 0.93;
					}
				}
			}
			return hit;
		};
		for (let it = 0; it < 60; it++) {
			if (!hits(true)) break;
			if (plant.stems.every((st) => st.head[1] <= 0.24)) shift((plant.base[0] < 0 ? -1 : 1) * 0.04);
		}
		// and inside the dashed frame lines
		for (let it = 0; it < 40; it++) {
			const [lo, hi] = extent(plant);
			if (lo < PAD) shift(0.03);
			else if (hi > W - PAD) shift(-0.03);
			else break;
		}
		plant.h = Math.max(...plant.stems.map((st) => st.head[1]));
		return !hits(false);
	}

	// blooms on screen as circles [x, y, r]
	function bloomCircles(plant) {
		return plant.stems.map((st) => {
			project(...st.head);
			return [out[0], out[1], st.size * 1.15 * k * out[2]];
		});
	}

	// a plant goes in only if its blooms don't sit on another plant's; it is lowered first to try a gap
	// Overlap is fine when the two blooms read apart (one bright and one faint, or one well behind the
	// other); only a near-total cover, or an overlap between look-alikes, counts as a clash. A look-alike
	// clash first tries flipping this plant's brightness to make the contrast.
	function spaceFor(plant, others = plants, loose = false) {
		const taken = others.filter((p) => p !== plant).flatMap((p) => bloomCircles(p).map((c) => [...c, p]));
		const cover = loose ? 0.42 : 0.58;
		let flipped = false;
		for (let it = 0; it < 6; it++) {
			let hard = false, soft = false;
			for (const a of bloomCircles(plant))
				for (const b of taken) {
					const d = Math.hypot(a[0] - b[0], a[1] - b[1]), lim = a[2] + b[2];
					if (d >= lim * 0.9) continue;
					const q = b[3];
					const contrast = Math.abs(plant.presence - q.presence) > 0.3 || Math.abs(plant.base[2] - q.base[2]) > 0.3;
					if (d < lim * cover) hard = true;
					else if (!contrast) soft = true;
				}
			if (!hard && !soft) return true;
			if (!hard && !flipped) {
				flipped = true;
				plant.featured = !plant.featured;
				plant.presence = plant.featured ? 0.95 : 0.4 + rand() * 0.2;
				continue;
			}
			for (const st of plant.stems) {
				if (st.head[1] < 0.25) continue;
				st.head[1] *= 0.84;
				st.ctrl[1] *= 0.84;
			}
			plant.h = Math.max(...plant.stems.map((st) => st.head[1]));
		}
		return false;
	}

	// a different species from its close neighbors, so plants side by side always read apart
	function pickKind(pool, x) {
		const near = new Set(plants.filter((p) => Math.abs(p.base[0] - x) < 0.3).map((p) => p.kind));
		const free = pool.filter((kd) => !near.has(kd));
		const from = free.length ? free : pool;
		return from[Math.floor(rand() * from.length)];
	}

	function contrastWithNearest(plant) {
		let best = null, bd = Infinity;
		for (const p of plants) {
			const d = Math.hypot(p.base[0] - plant.base[0], p.base[2] - plant.base[2]);
			if (d < bd) {
				bd = d;
				best = p;
			}
		}
		if (best && bd < 0.3) {
			plant.featured = !best.featured;
			plant.presence = plant.featured ? 0.95 : 0.4 + rand() * 0.2;
		}
	}

	function build() {
		rand = rng(prop.seed);
		const kinds = [...S.kinds];
		for (let i = kinds.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[kinds[i], kinds[j]] = [kinds[j], kinds[i]];
		}
		const cr = canvas.getBoundingClientRect();
		const boxes = (clearBoxes = [textEl, buttonEl].map((el) => {
			const b = el.getBoundingClientRect();
			return { l: b.left - cr.left - 18, r: b.right - cr.left + 18, b: b.bottom - cr.top + 18 };
		}));
		// the words themselves (not their full-width boxes), grown by half her size, so her wings never
		// cover the heading, the copy or the links
		const words = section.querySelectorAll(".cta__heading, .cta__copy, .cta__links a, .cta__links button");
		textAvoid = [...words].map((el) => {
			const range = document.createRange();
			range.selectNodeContents(el);
			const b = range.getBoundingClientRect();
			return { l: b.left - cr.left - 38, r: b.right - cr.left + 38, t: b.top - cr.top - 32, b: b.bottom - cr.top + 28 };
		});
		const narrow = W < 640;
		const n = Math.round((prop.n ?? 30) * (narrow ? 0.35 : 1));
		// spots along the width, more of them where the silhouette is taller
		const spots = [];
		if (prop.clumps) {
			for (let fx = 0.065; fx < 0.935; fx += (0.05 + rand() * 0.05) * (narrow ? 2 : 1)) {
				const count = 2 + Math.floor(rand() * (2 + 2 * tallness(fx)));
				for (let i = 0; i < count; i++) spots.push(clamp(fx + (rand() - 0.5) * 0.04, 0.055, 0.945));
			}
		} else {
			// spread evenly by weight, so both sides get their share instead of what a dice roll gives
			const cdf = [];
			let total = 0;
			const p = PAD / W + 0.01;
			for (let i = 0; i <= 200; i++) cdf.push((total += 0.3 + 0.7 * tallness(p + (i / 200) * (1 - 2 * p))));
			for (let i = 0; i < n; i++) {
				const target = ((i + 0.5 + (rand() - 0.5) * 0.8) / n) * total;
				const j = cdf.findIndex((c) => c >= target);
				spots.push(p + (Math.max(0, j) / 200) * (1 - 2 * p));
			}
			// one plant at each end, pushed in only as far as the margin: both sides end the same distance
			// from the dashed lines
			spots[0] = p;
			spots[n - 1] = 1 - p;
		}
		plants = [];
		let idx = 0;
		for (const fx0 of spots) {
			// the strip under the button only gets the low species
			const low = fx0 > 0.33 && fx0 < 0.67;
			const pool = low ? LOW : kinds;
			for (let tries = 0; tries < 6; tries++) {
				const fx = tries ? clamp(fx0 + (rand() - 0.5) * 0.06, 0.03, 0.97) : fx0;
				const z = rand() * 0.7; // only behind the ground line, so nothing reaches the links
				// the back row reaches the silhouette, the front stays lower: the volume fills top to bottom
				const maxH = Math.max(0.12, (groundY - topAt(fx) * H) / k - 0.16);
				const spec = {
					x: (fx * W - W / 2) / k, z,
					h: maxH * (0.58 + 0.42 * (z / 0.7)) * (0.85 + rand() * 0.15),
					delay: (1 - tallness(fx)) * 1.2 + rand() * 0.9,
					pool: low ? LOW : undefined,
					sizeMul: prop.size,
				};
				const plant = makePlant(spec, pickKind(pool, spec.x), idx);
				// short plants never pile up: overlapped, they turn into one blot
				if (keepClear(plant, boxes) && spaceFor(plant, plants, prop.loose && plant.h >= 0.34)) {
					plants.push(plant);
					idx++;
					break;
				}
			}
		}
		// a front row of short plants along the ground on the left half, in the gaps between the taller
		// ones, each a different species from its neighbors and the opposite brightness of the nearest
		if (!narrow)
			for (let fx = PAD / W + 0.02; fx < 0.5; fx += 0.05 + rand() * 0.04)
				for (let tries = 0; tries < 4; tries++) {
					const x = clamp(fx + (rand() - 0.5) * 0.02, PAD / W + 0.01, 0.5);
					const spec = { x: (x * W - W / 2) / k, z: rand() * 0.12, h: 0.2 + rand() * 0.12, delay: 0.8 + rand(), pool: FRONT, sizeMul: 0.9 };
					const plant = makePlant(spec, pickKind(FRONT, spec.x), idx);
					contrastWithNearest(plant);
					if (keepClear(plant, boxes) && spaceFor(plant, plants, false)) {
						plants.push(plant);
						idx++;
						break;
					}
				}
		// short plants in the strip under the button, low enough to stay clear of it
		if (!narrow)
			for (let fx = 0.36; fx < 0.64; fx += 0.04 + rand() * 0.03)
				for (let tries = 0; tries < 4; tries++) {
					const x = clamp(fx + (rand() - 0.5) * 0.02, 0.35, 0.65);
					const spec = { x: (x * W - W / 2) / k, z: rand() * 0.08, h: 0.1 + rand() * 0.05, delay: 1 + rand(), pool: LOW, sizeMul: 0.7, minPx: 24, stemRatio: 2.2 };
					const plant = makePlant(spec, pickKind(LOW, spec.x), idx);
					contrastWithNearest(plant);
					// only if it fits where it is: pushed aside, it would leave the strip
					if (keepClear(plant, boxes) && Math.abs(plant.base[0] - spec.x) < 0.01 && spaceFor(plant, plants, false)) {
						plants.push(plant);
						idx++;
						break;
					}
				}
		nextShut = 10;
		// spread each half out from the middle until its outermost plant meets the margin, so both sides
		// end the same distance from the dashed lines
		// (measured on the drawn glyphs of the grown garden, not on estimates)
		for (let it = 0; it < 3; it++) {
			const [lo, hi] = drawnSpan();
			if (hi < lo) break;
			const fl = clamp((W / 2 - PAD) / (W / 2 - lo), 1, 1.4), fr = clamp((W / 2 - PAD) / (hi - W / 2), 1, 1.4);
			for (const p of plants) shiftPlant(p, p.base[0] * ((p.base[0] < 0 ? fl : fr) - 1));
		}
		// back to front, so the hit test prefers the nearest plant
		plants.sort((a, b) => b.base[2] - a.base[2]);
		// a palette change mid-show keeps the garden grown
		if (startAt !== null)
			for (const p of plants) {
				p.age = 99;
				p.state = "alive";
			}
		dust = [];
		hover = null;
	}

	// ---------- projection into the character grid ----------

	const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), spt = Math.sin(PITCH);
	const out = [0, 0, 0, 0];

	function project(x, y, z) {
		const X = x * cy + z * sy;
		const Z = -x * sy + z * cy;
		const Y2 = y * cp + Z * spt;
		const Z2 = -y * spt + Z * cp;
		const p = (k * DIST) / (Z2 + DIST);
		out[0] = W / 2 + X * p;
		out[1] = groundY - Y2 * p;
		out[2] = p / k;
		out[3] = Z2;
		return out;
	}

	// one point into its cell: only the nearest surface in a cell is kept. Its grain votes for the hatching
	// direction, and edges vote for an outline glyph.
	function splat(x, y, z, r, g, b, w, tx, ty, tz, edge) {
		project(x, y, z);
		const sx = out[0], sy2 = out[1], pf = out[2], depth = out[3];
		const col = (sx / CW) | 0, row = (sy2 / CH) | 0;
		if (col < 0 || row < 0 || col >= cols || row >= rows) return;
		const i = row * cols + col;
		const zb = Zb[i];
		if (depth > zb + ZEPS) return;
		if (depth < zb - ZEPS) R[i] = G[i] = B[i] = A[i] = EX[i] = EY[i] = EW[i] = HX[i] = HY[i] = FV[i] = BL[i] = 0;
		if (depth < zb) Zb[i] = depth;
		const fog = clamp(0.45 + 0.55 * pf, 0.35, 1.15) * presence; // far is dimmer
		w *= pf;
		R[i] += r * fog * w;
		G[i] += g * fog * w;
		B[i] += b * fog * w;
		A[i] += w;
		FV[i] += curFacing * w;
		BL[i] += curBloom * w;
		if (tx || ty || tz) {
			project(x + tx * 0.02, y + ty * 0.02, z + tz * 0.02);
			const ang = 2 * Math.atan2(out[1] - sy2, out[0] - sx);
			const c = Math.cos(ang) * w, s = Math.sin(ang) * w;
			HX[i] += c;
			HY[i] += s;
			if (edge) {
				EX[i] += c;
				EY[i] += s;
				EW[i] += w;
			}
		}
	}

	// toward the camera, in world space
	const VIEW = [cp * sy, spt, -cp * cy];
	// a surface has two sides; light the one we see. No lit backs: that's what flattened the blooms.
	const shade = (nx, ny, nz) => {
		const nv = nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2];
		let nl = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
		if (nv < 0) nl = -nl;
		return S.amb + (1 - S.amb) * Math.max(0, nl) + S.rim * (1 - Math.abs(nv)) ** 2.5;
	};

	// The butterfly's colors: thin-film iridescence, like a soap bubble. The hue follows which way each
	// face looks, so every petal and fold the band crosses takes its own color.
	const IRI = [0, 0, 0];
	function iridescent(nx, ny, nz) {
		const f = 0.5 + 0.5 * (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2]);
		const t = f * 1.4 + nx * 0.35 + clock * 0.04;
		IRI[0] = 255 * (0.55 + 0.45 * Math.cos(TAU * t));
		IRI[1] = 255 * (0.55 + 0.45 * Math.cos(TAU * (t + 0.33)));
		IRI[2] = 255 * (0.55 + 0.45 * Math.cos(TAU * (t + 0.67)));
		return IRI;
	}

	function lineChar(a, flat = "-") {
		a = ((a % Math.PI) + Math.PI) % Math.PI;
		if (a < Math.PI / 8 || a >= (7 * Math.PI) / 8) return flat;
		if (a < (3 * Math.PI) / 8) return "\\";
		if (a < (5 * Math.PI) / 8) return "|";
		return "/";
	}

	// how far a touch has pushed the stem at height y
	const sway = (plant, y) => plant.bend * 0.35 * (y / plant.h) ** 2 * plant.h;

	function bez(st, base, t, o) {
		const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
		for (let j = 0; j < 3; j++) o[j] = a * base[j] + b * st.ctrl[j] + c * st.head[j];
		return o;
	}

	function bezT(st, base, t) {
		return norm([0, 1, 2].map((j) => 2 * (1 - t) * (st.ctrl[j] - base[j]) + 2 * t * (st.head[j] - st.ctrl[j])));
	}

	const tmp = [0, 0, 0];

	function drawBloom(plant, st, b) {
		const e = ease(b), s = st.size * lerp(0.45, 1, e);
		const [hx, hy, hz] = st.headNow;
		const { n, t1, t2 } = st.basis;
		const cw = Math.cos(plant.wob), sw = Math.sin(plant.wob);
		const d = st.pts, wk = 0.55 + 0.45 * b, tint = 1 - e, iri = plant.iri;
		const bud = plant.C.rib;
		const to = (x, y, z, o) => {
			const rx = x * cw - z * sw, rz = z * cw + x * sw;
			o[0] = rx * t1[0] + y * n[0] + rz * t2[0];
			o[1] = rx * t1[1] + y * n[1] + rz * t2[1];
			o[2] = rx * t1[2] + y * n[2] + rz * t2[2];
			return o;
		};
		const P = [0, 0, 0], N = [0, 0, 0], T = [0, 0, 0];
		curBloom = 1;
		for (let i = 0; i < d.length; i += 17) {
			to((d[i + 3] + (d[i] - d[i + 3]) * e) * s, (d[i + 4] + (d[i + 1] - d[i + 4]) * e) * s, (d[i + 5] + (d[i + 2] - d[i + 5]) * e) * s, P);
			to(d[i + 6], d[i + 7], d[i + 8], N);
			to(d[i + 9], d[i + 10], d[i + 11], T);
			// the inside of a cup, seen past its rim, sits in shadow: that's what gives a bloom its depth
			const nv = N[0] * VIEW[0] + N[1] * VIEW[1] + N[2] * VIEW[2];
			// petals darken toward the center; the center itself (a disc) is a bright dome
			const disc = d[i + 16] === 2;
			const ao = disc ? 1.25 : S.ao + (1 - S.ao) * sstep(0.04, 0.55, Math.hypot(d[i], d[i + 2]));
			const L = shade(N[0], N[1], N[2]) * (nv < 0 ? S.cup : 1) * ao * (d[i + 16] === 1 ? S.edgeBoost : 1);
			curFacing = Math.abs(nv);
			let r = d[i + 12] + (bud[0] - d[i + 12]) * tint, g = d[i + 13] + (bud[1] - d[i + 13]) * tint, b2 = d[i + 14] + (bud[2] - d[i + 14]) * tint;
			if (iri > 0.01) {
				// a band of color sweeps across the bloom, like light on holographic foil: it touches one part
				// at a time and the rest stays grey. In bloom units (0.52: the scale it was tuned at), so every
				// flower gets about one band whatever its size.
				const u = 0.52 / s;
				const ph = (((P[1] * u * 1.6 + P[0] * u * 0.9 - P[2] * u * 0.4 - clock * 0.55) % 1) + 1) % 1;
				const amt = Math.exp(-(((ph - 0.5) / 0.09) ** 2)) * 0.95 * iri;
				if (amt > 0.01) {
					// keep the grey's light and dark, so the colored part still has the same volume
					const c = iridescent(N[0], N[1], N[2]), v = 0.35 + 0.9 * ((r + g + b2) / 765);
					r += (c[0] * v - r) * amt;
					g += (c[1] * v - g) * amt;
					b2 += (c[2] * v - b2) * amt;
				}
			}
			splat(hx + P[0], hy + P[1], hz + P[2], r * L, g * L, b2 * L, d[i + 15] * wk, T[0], T[1], T[2], d[i + 16] === 1);
		}
		curBloom = 0;
	}

	function drawLeaf(lf, ax, ay, az, g) {
		const d = lf.pts;
		for (let i = 0; i < d.length; i += 14) {
			const x = d[i] * g, z = d[i + 2] * g;
			const r = Math.hypot(x, z);
			const L = shade(d[i + 3], d[i + 4], d[i + 5]);
			curFacing = Math.abs(d[i + 3] * VIEW[0] + d[i + 4] * VIEW[1] + d[i + 5] * VIEW[2]);
			splat(ax + x, ay + d[i + 1] * g + lf.a * r, az + z, d[i + 9] * L, d[i + 10] * L, d[i + 11] * L, d[i + 12], d[i + 6], d[i + 7], d[i + 8], d[i + 13]);
		}
	}

	// ---------- life cycle: now and then a grown bloom closes its petals into a bud, stays shut a few
	// seconds, and opens again. Three close together, and the next three wait until they're open. ----------

	const fullAge = (p) => GROW + Math.max(...p.stems.map((s) => s.delay)) + 0.2;

	function lifecycle(dt) {
		let shut = 0;
		for (const p of plants) {
			if (p.state === "grow") {
				p.age += dt * p.rate;
				if (p.age >= fullAge(p)) p.state = "alive";
			}
			if (p.shutT && (p.shutHold -= dt) <= 0) p.shutT = 0;
			// about a second to close, a little longer to open
			p.shut = clamp(p.shut + (p.shutT ? dt / 1.1 : -dt / 1.4));
			if (p.shutT || p.shut > 0) shut++;
		}
		nextShut -= dt;
		if (nextShut <= 0 && !shut) {
			// three at once, each staying shut its own while
			const open = plants.filter((p) => p.state === "alive" && !p.shutT && p.shut === 0 && p !== hover?.plant && !flock.some((b) => b.target?.[0] === p));
			for (let c = 0; c < 3 && open.length; c++) {
				const p = open.splice(Math.floor(rand() * open.length), 1)[0];
				p.shutT = 1;
				p.shutHold = 1.1 + 2.5 + rand() * 2.5; // closing, then 2.5-5 s shut
				nudge(p, rand() < 0.5 ? -1 : 1, 0.3); // the stem gives a little as it closes
			}
			nextShut = 4 + rand() * 5;
		}
	}


	const labels = [];

	function simulate(grown, dt) {
		R.fill(0); G.fill(0); B.fill(0); A.fill(0); EX.fill(0); EY.fill(0); EW.fill(0); HX.fill(0); HY.fill(0); FV.fill(0); BL.fill(0);
		Zb.fill(Infinity);
		labels.length = 0;

		if (startAt !== null && !reduce) lifecycle(dt);

		for (const plant of plants) {
			// only a touched plant moves: its stem on one spring, each leaf on its own, lagging behind
			plant.bendV += (-26 * plant.bend - 3.2 * plant.bendV) * dt;
			plant.bend += plant.bendV * dt;
			plant.wobV += (-18 * plant.wob - 2.6 * plant.wobV) * dt;
			plant.wob += plant.wobV * dt;
			// her colors come in fast when she lands and fade slowly after she leaves
			plant.iri += (plant.iriT - plant.iri) * Math.min(1, dt * (plant.iriT > plant.iri ? 2.5 : 0.35));
			for (const lf of plant.leaves) {
				lf.v += (-34 * lf.a - 3 * lf.v - plant.bendV * lf.gain * 1.4) * dt;
				lf.a += lf.v * dt;
			}
			plant.hit.length = 0;
			plant.growth = clamp(plant.age / GROW);
			// a faint plant lights up while the butterfly is on it
			presence = Math.max(plant.presence, plant.iri * 0.95);
			if (startAt !== null && plant.age <= 0.05) splat(plant.base[0], 0.004, plant.base[2], 235, 235, 235, 1.4); // the seed

			plant.stems.forEach((st, si) => {
				const base = plant.base;
				const g = clamp((plant.age - st.delay) / GROW);
				const off = sway(plant, st.head[1]);
				st.headNow[0] = st.head[0] + off;
				st.headNow[1] = st.head[1];
				st.headNow[2] = st.head[2] + off * 0.3;
				if (g <= 0) return;
				const s = clamp(g / STEM_END);
				const len = Math.hypot(st.head[0] - base[0], st.head[1]);
				const N = Math.max(40, Math.round(len * 140));
				const top = Math.floor(s * N);
				const C = plant.C;
				for (let j = 0; j <= top; j++) {
					const t = j / N;
					bez(st, base, t, tmp);
					const o = sway(plant, tmp[1]);
					const T = bezT(st, base, t);
					curFacing = 0.2;
					splat(tmp[0] + o, tmp[1], tmp[2] + o * 0.3, C.stem[0], C.stem[1], C.stem[2], 1, T[0], T[1], T[2], 1);
					if (j % 6 === 0) {
						project(tmp[0] + o, tmp[1], tmp[2]);
						plant.hit.push(out[0], out[1], 1, tmp[0] + o, tmp[1]);
					}
				}
				if (s < 1) {
					bez(st, base, s, tmp);
					splat(tmp[0] + sway(plant, tmp[1]), tmp[1], tmp[2], 255, 255, 255, 2.2);
				}

				if (si === 0) {
					for (const lf of plant.leaves) {
						const lg = lf.t === 0 ? clamp(s / 0.4) : clamp((s - lf.t) / 0.22);
						if (lg <= 0) continue;
						bez(st, base, lf.t, tmp);
						const o = sway(plant, tmp[1]);
						drawLeaf(lf, tmp[0] + o, tmp[1], tmp[2] + o * 0.3, ease(lg));
						for (const f of [0.4, 0.8]) {
							project(tmp[0] + o + lf.tip[0] * f, tmp[1] + lf.tip[1] * f, tmp[2] + lf.tip[2] * f);
							plant.hit.push(out[0], out[1], 2, tmp[0] + o, tmp[1]);
						}
					}
					// the stem writes its own progress next to it while it grows
					if (!plant.quiet && plant.age < GROW * STEM_END + 1.6) {
						const fade = clamp((GROW * STEM_END + 1.6 - plant.age) / 1.2);
						for (let t = 0.25; t <= s + 1e-6; t += 0.25) {
							bez(st, base, t, tmp);
							project(tmp[0], tmp[1], tmp[2]);
							labels.push({ x: out[0] + 9, y: out[1], text: t.toFixed(2), a: fade * (0.3 + 0.7 * (t / Math.max(s, 0.25))) });
						}
					}
				}

				const b = clamp((g - STEM_END + 0.06) / (1 - STEM_END + 0.06));
				if (b > 0) {
					const sh = plant.shut * plant.shut * (3 - 2 * plant.shut);
					drawBloom(plant, st, b * (1 - 0.95 * sh));
					project(...st.headNow);
					const r = st.size * k * out[2] * 0.7;
					for (const [ox, oy] of [[0, 0], [-r, 0], [r, 0], [0, -r]]) plant.hit.push(out[0] + ox, out[1] + oy, 0, st.headNow[0], st.headNow[1]);
				}
			});
		}

		presence = 1;

		for (let i = dust.length - 1; i >= 0; i--) {
			const p = dust[i];
			p.life += dt;
			if (p.life > p.max) {
				dust.splice(i, 1);
				continue;
			}
			p.vy += 200 * dt;
			p.vx *= 1 - 1.6 * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
		}
	}

	// above 180 a value approaches 255 slowly instead of clipping, so highlights keep their shading
	const knee = (v) => (v < 180 ? v : 180 + (75 * (v - 180)) / (v - 105));
	const hash = (i) => ((Math.imul(i, 2654435761) >>> 0) % 1000) / 1000;

	// a bloom cell's glyph. The grey carries the light; the glyph is grain: dots in the dark, round glyphs
	// where it's lit, and strokes along the surface where it turns away
	function bloomGlyph(lum, fv, grain, h) {
		if (lum < 0.12) return h % 3 ? "." : "·";
		if (fv < 0.4) return lineChar(grain);
		if (h % 29 === 0) return "∂×~"[h % 3]; // a few ornaments
		if (lum > 0.45) return "O0o"[h % 3];
		return lum > 0.25 ? "o=~"[h % 3] : "-·."[h % 3];
	}

	function render(time, now) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		ctx.font = FONT;
		ctx.textBaseline = "top";
		// nothing past the garden's margins: the same gap to the dashed lines and to the links row
		const c0 = Math.ceil(PAD / CW), c1 = Math.floor((W - PAD) / CW), r1 = Math.floor(floorY / CH);
		// a bloom is solid: a cell left empty between two filled ones takes their average
		const full = (j) => A[j] >= 0.2 && BL[j] > A[j] * 0.5;
		for (let i = cols + 1, n = cols * (rows - 1) - 1; i < n; i++) {
			if (A[i] >= 0.06) continue;
			let a2 = -1, b2 = -1;
			if (full(i - 1) && full(i + 1)) [a2, b2] = [i - 1, i + 1];
			else if (full(i - cols) && full(i + cols)) [a2, b2] = [i - cols, i + cols];
			if (a2 < 0) continue;
			const fa = 0.15 / A[a2], fb = 0.15 / A[b2];
			R[i] = R[a2] * fa + R[b2] * fb;
			G[i] = G[a2] * fa + G[b2] * fb;
			B[i] = B[a2] * fa + B[b2] * fb;
			FV[i] = FV[a2] * fa + FV[b2] * fb;
			BL[i] = 0.3;
			A[i] = 0.3;
			Zb[i] = Math.max(Zb[a2], Zb[b2]);
		}
		const reach = 2;
		for (let i = 0, n = cols * rows; i < n; i++) {
			const a = A[i];
			if (a < 0.06) continue;
			const ci = i % cols;
			if (ci < c0 || ci >= c1 || ((i / cols) | 0) >= r1) continue;
			const inv = 1 / a;
			const vis = Math.min(1.35, 0.75 + a * 0.5);
			let r = R[i] * inv * vis, g = G[i] * inv * vis, b = B[i] * inv * vis;
			const bloom = BL[i] * inv > 0.5, fv = FV[i] * inv;
			// where a nearer petal passes over this one, this one sits in its shadow
			if (bloom) {
				r *= S.exp;
				g *= S.exp;
				b *= S.exp;
				const z = Zb[i];
				let hidden = false;
				for (let s = 1; s <= reach && !hidden; s++)
					for (const j of [i - s, i + s, i - s * cols, i + s * cols])
						if (j >= 0 && j < n && A[j] >= 0.06 && Zb[j] < z - 0.05) hidden = true;
				if (hidden) {
					r *= S.contact;
					g *= S.contact;
					b *= S.contact;
				}
			}
			if (bloom) {
				r = knee(r);
				g = knee(g);
				b = knee(b);
			}
			const lum = (r + g + b) / 765;
			const h = Math.imul(i, 2654435761) >>> 7;
			const grain = HX[i] || HY[i] ? 0.5 * Math.atan2(HY[i], HX[i]) : 0;
			let ch;
			if (bloom) {
				if (lum < 0.04) continue;
				ch = bloomGlyph(lum, fv, grain, h);
			} else if (EW[i] > a * 0.7) ch = lineChar(0.5 * Math.atan2(EY[i], EX[i]));
			else if (a < 0.2) ch = ".";
			else if (lum > 0.6) ch = LIT[h % LIT.length];
			else if (lum > 0.36) ch = MID[(h + (i % 13 === 0 ? (time * 6) | 0 : 0)) % MID.length]; // a few cells keep counting
			else if (HX[i] || HY[i]) ch = lineChar(0.5 * Math.atan2(HY[i], HX[i]), "=");
			else ch = ":";
			// the butterfly's sparkle: a bright cell now and then flashes a '*'
			if (!reduce && lum > 0.55 && Math.sin(time * 5 + hash(i) * 40) > 0.985) {
				ch = "*";
				r = g = b = 255;
			}
			ctx.fillStyle = `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
			ctx.fillText(ch, (i % cols) * CW, ((i / cols) | 0) * CH);
		}

		gctx.clearRect(0, 0, glow.width, glow.height);
		gctx.drawImage(canvas, 0, 0, glow.width, glow.height);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = "lighter";
		ctx.filter = `blur(${2 * dpr}px)`;
		ctx.globalAlpha = 0.45;
		ctx.drawImage(glow, 0, 0, canvas.width, canvas.height);
		ctx.filter = `blur(${12 * dpr}px)`;
		ctx.globalAlpha = 0.3;
		ctx.drawImage(glow, 0, 0, canvas.width, canvas.height);
		ctx.restore();

		// characters shaken off by a touch, like the butterfly's dust
		ctx.font = FONT;
		ctx.textBaseline = "top";
		for (const p of dust) {
			if (p.x < PAD || p.x > W - PAD || p.y > floorY - CH) continue;
			ctx.globalAlpha = 1 - p.life / p.max;
			ctx.fillStyle = p.c;
			ctx.fillText(p.ch, Math.round(p.x / CW) * CW, Math.round(p.y / CH) * CH);
		}
		ctx.globalAlpha = 1;

		ctx.font = LABEL_FONT;
		ctx.textBaseline = "middle";
		const [lr, lg, lb] = pal.label;
		// a label that would land on one already drawn is skipped, so neighbors' counts don't pile up
		const placed = [];
		for (const l of labels) {
			if (l.x > W - PAD - 20 || l.y > floorY) continue;
			if (placed.some((q) => Math.abs(q[0] - l.x) < 30 && Math.abs(q[1] - l.y) < 12)) continue;
			placed.push([l.x, l.y]);
			ctx.fillStyle = `rgba(${lr},${lg},${lb},${l.a * 0.8})`;
			ctx.fillText(l.text, l.x, l.y);
		}
		for (const b of flock) {
			bf = b;
			drawButterfly();
		}
	}

	// ---------- the butterfly: the site's, in miniature (same wing outlines, glyphs and palette),
	// going from flower to flower. Landing and taking off nudge the plant. ----------

	// two of them: the hero's size and a smaller one that flaps faster and flies a little quicker
	const SIZES = [7, 4.5].map((px, i) => {
		const font = `bold ${px}px ui-monospace, Menlo, Consolas, monospace`;
		ctx.font = font;
		return { font, cw: ctx.measureText("M").width || px * 0.6, ch: px * 1.09, span: (64 * px) / 7, flap: i ? 9 : 7, speed: i ? 135 : 110 };
	});
	const WING = {
		f: { pts: [[0.04, 0.17], [0.36, 0.46], [0.74, 0.7], [1.04, 0.82], [1.14, 0.78], [1.06, 0.62], [0.84, 0.4], [0.56, 0.18], [0.28, 0.05], [0.1, 0.03]],
			root: [0.06, 0.08], veins: [6, 18, 30, 41, 52, 63] },
		h: { pts: [[0.05, 0.06], [0.36, 0.08], [0.58, 0], [0.68, -0.14], [0.66, -0.32], [0.56, -0.5], [0.4, -0.62], [0.24, -0.6], [0.1, -0.46], [0.03, -0.16]],
			root: [0.06, 0.02], veins: [-4, -22, -40, -57, -72, -86] },
	};
	const flock = [];
	let bf = null; // the one being moved or drawn

	function inPoly(pts, x, y) {
		let c = false;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[i], b = pts[j];
			if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
		}
		return c;
	}

	// distance to the outline and the direction of its nearest edge
	function nearestEdge(pts, x, y) {
		let best = 1e9, ang = 0;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[j], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
			const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy));
			const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
			if (d < best) {
				best = d;
				ang = Math.atan2(dy, dx);
			}
		}
		return [best, ang];
	}

	// one cell of the butterfly: [glyph, color, alpha] or null. u runs out along the wing, v up.
	function wingCell(u, v, side, kf) {
		for (const w of [WING.f, WING.h]) {
			if (!inPoly(w.pts, u, v)) continue;
			const [d, ang] = nearestEdge(w.pts, u, v);
			const toScreen = (a) => lineChar(Math.atan2(-Math.sin(a), Math.cos(a) * side * kf));
			if (d < 0.08) return [toScreen(ang), "#ffffff", 1];
			const ru = u - w.root[0], rv = v - w.root[1];
			for (const deg of w.veins) {
				const a = (deg * Math.PI) / 180, along = ru * Math.cos(a) + rv * Math.sin(a);
				if (along > 0.12 && Math.abs(ru * Math.sin(a) - rv * Math.cos(a)) < 0.04) return [toScreen(a), "#a8a8a8", 0.75];
			}
			const n = 0.5 + 0.5 * Math.sin(u * 14 + 2.2 * Math.sin(v * 9)) * Math.sin(v * 12 + u * 5);
			if (n > 0.72) return ["~", v > 0.3 ? "#ffe9b0" : "#cfe3ff", 0.6];
			if (n > 0.55) return [".", "#a8a8a8", 0.45];
			return null;
		}
		return null;
	}

	function drawButterfly() {
		if (!bf) return;
		const { font, cw: BCW, ch: BCH, span: BF_SPAN } = bf.size;
		ctx.font = font;
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		for (const p of bf.trail) {
			ctx.globalAlpha = (1 - p.life / 1.2) * 0.5;
			ctx.fillStyle = "#a8a8a8";
			ctx.fillText(p.ch, p.x, p.y);
		}
		const S = BF_SPAN / 2, kf = bf.kf;
		const c0 = Math.ceil((S * 1.2) / BCW), rTop = Math.ceil((S * 0.9) / BCH), rBot = Math.ceil((S * 0.7) / BCH);
		ctx.shadowColor = "rgba(255,255,255,0.9)";
		ctx.shadowBlur = 5;
		for (let r = -rTop; r <= rBot; r++)
			for (let q = -c0; q <= c0; q++) {
				const px = q * BCW, py = r * BCH, v = -py / S;
				let cell = null;
				if (q === 0) {
					if (v > 0.12 && v < 0.34) cell = ["•", "#ffffff", 1];
					else if (v > -0.06 && v <= 0.12) cell = ["#", "#ffffff", 1];
					else if (v > -0.58 && v <= -0.06) cell = ["|", "#ffffff", 0.95];
				} else if (kf > 0.08) cell = wingCell(Math.abs(px) / (S * kf), v, Math.sign(px), kf);
				if (!cell) continue;
				// her own dark cell under each glyph, so she reads on top of a white bloom
				ctx.shadowBlur = 0;
				ctx.globalAlpha = 1;
				ctx.fillStyle = "#0a0a0a";
				ctx.fillRect(bf.x + px - BCW / 2, bf.y + py - BCH / 2, BCW, BCH);
				ctx.shadowBlur = 5;
				ctx.globalAlpha = cell[2];
				ctx.fillStyle = cell[1];
				ctx.fillText(cell[0], bf.x + px, bf.y + py);
			}
		ctx.shadowBlur = 0;
		ctx.shadowColor = "transparent";
		ctx.globalAlpha = 1;
		ctx.textAlign = "left";
	}

	// where she sits: on the bloom's upper edge, her body resting on it
	function seat([plant, st]) {
		project(...st.headNow);
		return [out[0], out[1] - st.size * k * out[2] * 0.75 - bf.size.span * 0.18];
	}

	const openBlooms = (except) =>
		plants.flatMap((p) => (p.state === "alive" && p.growth >= 1 && !p.shutT && p.shut === 0 ? p.stems.filter((st) => st !== except).map((st) => [p, st]) : []));

	const inText = (x, y) => textAvoid.some((b) => x > b.l && x < b.r && y > b.t && y < b.b);

	// a flight path to (tx, ty) that never crosses the words: over the garden or, if that's blocked, under
	// it. [lift, lean] for the curve's middle point, or null if there's none.
	function route(tx, ty) {
		for (let i = 0; i < 16; i++) {
			const lift = i % 2 ? Math.min(floorY - 30, Math.max(bf.y, ty) + 10 + Math.random() * 40) : Math.min(bf.y, ty) - (40 + Math.random() * 60);
			const lean = (Math.random() - 0.5) * 120, cx = (bf.x + tx) / 2 + lean;
			let ok = true;
			for (let k2 = 0; k2 <= 32 && ok; k2++) {
				const e = k2 / 32, a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
				if (inText(a * bf.x + b * cx + c * tx, a * bf.y + b * lift + c * ty)) ok = false;
			}
			if (ok) return [lift, lean];
		}
		return null;
	}

	// a flower she hasn't been to lately, mostly one of the nearer ones, so she wanders the whole garden
	// without crossing it on every flight; only where she can sit and fly to without covering any words.
	// [bloom, route] or null.
	function nextBloom(except) {
		let list = openBlooms(except)
			.filter((b) => !inText(...seat(b)) && !flock.some((o) => o !== bf && o.target?.[1] === b[1]))
			.map((b) => [b, Math.hypot(seat(b)[0] - bf.x, seat(b)[1] - bf.y)])
			.sort((a, b) => a[1] - b[1]);
		const fresh = list.filter(([b]) => !bf.seen.includes(b[1]));
		if (fresh.length) list = fresh;
		if (!list.length) return null;
		const first = Math.floor(Math.random() ** 1.6 * Math.min(8, list.length));
		for (const [b] of [list[first], ...list.filter((_, i) => i !== first)]) {
			const path = route(...seat(b));
			if (!path) continue;
			bf.seen.push(b[1]);
			if (bf.seen.length > Math.max(3, openBlooms().length - 3)) bf.seen.shift();
			return [b, path];
		}
		return null;
	}

	function nudge(plant, dir, s) {
		plant.bendV += dir * 1.6 * s;
		plant.wobV += dir * 2 * s;
	}

	function flyTo([target, [lift, lean]]) {
		const [tx, ty] = seat(target);
		bf.state = "fly";
		bf.target = target;
		bf.from = [bf.x, bf.y];
		bf.t = 0;
		bf.dur = clamp(Math.hypot(tx - bf.x, ty - bf.y) / bf.size.speed, 1.6, 6);
		bf.lift = lift;
		bf.lean = lean;
	}

	// they come in as soon as a few flowers are open, each straight to a flower near one of the edges,
	// entering from that side; the small one a little later
	function updateButterflies(dt, time) {
		if (startAt === null) return;
		const since = (performance.now() - startAt) / 1000;
		if (flock.length < SIZES.length && since > (flock.length ? flock[0].born + 1.5 : 0) && openBlooms().length >= 4) {
			bf = { x: 0, y: 0, kf: 1, phase: 0, trail: [], state: "fly", seen: [], size: SIZES[flock.length], born: since };
			const near = openBlooms()
				.filter((b) => !inText(...seat(b)) && !flock.some((o) => o.target?.[1] === b[1]))
				.map((b) => [b, Math.min(seat(b)[0], W - seat(b)[0])])
				.sort((a, b) => a[1] - b[1])
				.slice(0, 6);
			if (near.length) {
				const b = near[Math.floor(Math.random() * near.length)][0];
				const [tx, ty] = seat(b);
				bf.x = tx < W / 2 ? -20 : W + 20;
				bf.y = ty - 30;
				const path = route(tx, ty);
				if (path) {
					bf.seen.push(b[1]);
					flyTo([b, path]);
					bf.dur = Math.min(bf.dur, 1.8);
					flock.push(bf);
				}
			}
		}
		for (const b of flock) {
			bf = b;
			updateButterfly(dt, time);
		}
	}

	function updateButterfly(dt, time) {
		for (let i = bf.trail.length - 1; i >= 0; i--) if ((bf.trail[i].life += dt) > 1.2) bf.trail.splice(i, 1);
		const [plant] = bf.target;
		const there = plants.includes(plant) && plant.state === "alive" && !plant.shutT;
		if (bf.state === "fly") {
			if (!there) {
				const other = nextBloom();
				if (other) flyTo(other);
				return;
			}
			bf.t = Math.min(1, bf.t + dt / bf.dur);
			const e = 0.5 - 0.5 * Math.cos(Math.PI * bf.t);
			const [tx, ty] = seat(bf.target);
			const cx = (bf.from[0] + tx) / 2 + bf.lean, cyy = bf.lift;
			bf.x = (1 - e) * (1 - e) * bf.from[0] + 2 * (1 - e) * e * cx + e * e * tx + Math.sin(time * 5) * 3 * (1 - e);
			bf.y = (1 - e) * (1 - e) * bf.from[1] + 2 * (1 - e) * e * cyy + e * e * ty + Math.sin(time * 7) * 4 * (1 - e);
			bf.phase += dt * TAU * bf.size.flap;
			bf.kf = 0.2 + 0.8 * Math.abs(Math.cos(bf.phase));
			if (Math.random() < dt * 14) bf.trail.push({ x: bf.x, y: bf.y + 4, life: 0, ch: Math.random() < 0.6 ? "." : "~" });
			if (bf.t >= 1) {
				bf.state = "perch";
				bf.stay = 3 + Math.random() * 5;
				nudge(plant, Math.sign(tx - bf.from[0]) || 1, 0.6);
				plant.iriT = 1;
			}
		} else {
			// she rides the bloom's sway, opening and closing her wings now and then
			const [tx, ty] = seat(bf.target);
			bf.x = tx;
			bf.y = ty;
			bf.kf = 0.3 + 0.7 * Math.max(0, Math.sin(time * 1.3)) ** 3;
			bf.stay -= dt;
			if (!there || bf.stay <= 0) {
				if (there) nudge(plant, Math.random() < 0.5 ? -1 : 1, 0.35);
				plant.iriT = 0;
				const other = nextBloom(bf.target[1]);
				if (other) flyTo(other);
			}
		}
	}

	// ---------- touch ----------

	function pick(x, y) {
		let best = null, bd = 26 * 26;
		for (const plant of plants) {
			const h = plant.hit;
			for (let i = 0; i < h.length; i += 5) {
				const d = (h[i] - x) ** 2 + (h[i + 1] - y) ** 2;
				if (d <= bd) {
					bd = d;
					best = { plant, part: h[i + 2], wx: h[i + 3], wy: h[i + 4] };
				}
			}
		}
		return best;
	}

	function poke(hit, x, y, strength, now) {
		const plant = hit.plant, C = plant.C;
		project(...plant.base);
		const dir = x < out[0] ? 1 : -1; // pushed away from the pointer
		plant.bendV += dir * 2.2 * strength;
		plant.wobV += dir * 2.4 * strength;
		plant.cool = now + 650;
		const toCss = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
		const palette = hit.part === 0 ? [C.main, C.main, [255, 255, 255], C.center] : hit.part === 2 ? [C.leaf, C.rib] : [C.stem, C.rib];
		const n = Math.round(26 * strength) + 2;
		for (let i = 0; i < n; i++)
			dust.push({
				x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
				vx: (Math.random() - 0.5) * 160 * strength - dir * 30, vy: -(30 + Math.random() * 140) * strength,
				life: 0, max: 0.7 + Math.random(), ch: DUST[(Math.random() * DUST.length) | 0],
				c: toCss(palette[(Math.random() * palette.length) | 0]),
			});
	}

	function pointer(e) {
		const r = canvas.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	}

	section.addEventListener("pointermove", (e) => {
		if (e.target.closest("a, button")) return;
		const [x, y] = pointer(e);
		const now = performance.now();
		const hit = pick(x, y);
		if (!hit) return;
		hover = { ...hit, x, y, until: now + 1600 };
		if (!reduce && now > hit.plant.cool) poke(hit, x, y, 0.25, now);
		kick();
	});

	section.addEventListener("pointerdown", (e) => {
		if (e.target.closest("a, button")) return;
		const [x, y] = pointer(e);
		const now = performance.now();
		const hit = pick(x, y);
		if (!hit) return;
		hover = { ...hit, x, y, until: now + 2600 };
		if (!reduce) poke(hit, x, y, 1, now);
		kick();
	});

	// ---------- loop ----------

	let last = performance.now();
	function frame(now) {
		raf = 0;
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		const grown = startAt === null ? 0 : (now - startAt) / 1000;
		clock = now / 1000;
		simulate(grown, dt);
		updateButterflies(dt, now / 1000);
		render(now / 1000, now);
		if (visible) raf = requestAnimationFrame(frame);
	}

	function drawStill() {
		for (const p of plants) {
			p.age = 99;
			p.state = "alive";
		}
		simulate(99, 0);
		// still: each butterfly rests on one of the brighter flowers
		for (const p of plants) p.growth = 1;
		flock.length = 0;
		for (const size of SIZES) {
			bf = { x: 0, y: 0, kf: 0.6, trail: [], state: "perch", stay: Infinity, seen: [], size };
			const free = openBlooms().filter((b) => !inText(...seat(b)) && !flock.some((o) => o.target[0] === b[0]));
			const spot = free.find(([p]) => p.featured) ?? free[0];
			if (!spot) break;
			[bf.x, bf.y] = seat(spot);
			bf.target = spot;
			flock.push(bf);
			spot[0].iri = spot[0].iriT = 1;
		}
		simulate(99, 0);
		render(0, performance.now());
	}

	function kick() {
		if (reduce) return drawStill();
		if (!raf && visible) {
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}
	}

	function resize() {
		const r = canvas.getBoundingClientRect();
		if (!r.width) return;
		W = r.width;
		H = r.height;
		dpr = Math.min(2, devicePixelRatio || 1);
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		glow.width = Math.ceil(canvas.width / 4);
		glow.height = Math.ceil(canvas.height / 4);
		cols = Math.ceil(W / CW);
		rows = Math.ceil(H / CH);
		const n = cols * rows;
		[R, G, B, A, Zb, EX, EY, EW, HX, HY, FV, BL] = Array.from({ length: 12 }, () => new Float32Array(n));
		// the ground sits PAD above the links row, the same gap the plants keep from the dashed lines
		PAD = W < 768 ? 20 : 40;
		const links = section.querySelector(".cta__links")?.getBoundingClientRect();
		floorY = links ? links.top - r.top - PAD : H - 90;
		groundY = floorY - CH;
		k = Math.min(W / 2 / 1.7, groundY / 1.6);
		halfW = W / 2 / k;
		// the halftone draws the grass from this: where the ground is and how tall the grass grows
		window.gardenZone = { rect: () => canvas.getBoundingClientRect(), ground: groundY, zone: ZONE };
		build();
		kick();
	}

	new ResizeObserver(resize).observe(canvas);

	new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			if (visible && startAt === null && entry.intersectionRatio > 0.3) startAt = performance.now();
			kick();
		},
		{ threshold: [0, 0.3] },
	).observe(section);
}
