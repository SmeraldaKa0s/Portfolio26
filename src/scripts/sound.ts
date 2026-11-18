// Ambient sound: three layers that always play and cross-fade (2.2 s) with the section in view, notes when the
// footer's plants are touched or a butterfly lands, and one soft note ("Gota") when the hero's butterfly lands.
// Everything is synthesized with the Web Audio API (no audio files).
// Browsers only let audio start after a real gesture, so it begins with the first click, tap or key anywhere
// on the page (the wave button's tooltip says "Escuchar" until then). The wave keeps moving while it plays;
// pressing it mutes the sound and the wave goes flat, and pressing it again brings the sound back.

const VOLUME = 0.7;
const FADE = 2.2;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// "Noche en tres capas": each layer is a warm pad (detuned triangles through a low-pass that breathes)
const LAYERS = [
	{ root: 38, iv: [0, 7, 12, 16], cut: 520 },
	{ root: 43, iv: [0, 5, 9, 14], cut: 800 },
	{ root: 45, iv: [0, 7, 11, 16], cut: 1250 },
];

// which layer each section brings up
const SECTIONS: [string, number][] = [
	["index", 0],
	["work", 0],
	["info", 1],
	["experience", 1],
	["contact", 2],
];

const PENTATONIC = [0, 2, 4, 7, 9];
const PLUCK_ROOT = 52;

let ctx: AudioContext | null = null;
let out: GainNode;
let bus: GainNode;
let layerGains: GainNode[] = [];
let muted = false;
let started = false;
let section = 0;

function build(): void {
	ctx = new AudioContext();
	out = ctx.createGain();
	out.gain.value = 0;
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -10;
	comp.ratio.value = 20;

	// reverb: stereo noise that dies away, made here
	const verb = ctx.createConvolver();
	const len = Math.floor(ctx.sampleRate * 3.2);
	const ir = ctx.createBuffer(2, len, ctx.sampleRate);
	for (let c = 0; c < 2; c++) {
		const d = ir.getChannelData(c);
		for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
	}
	verb.buffer = ir;

	bus = ctx.createGain();
	const dry = ctx.createGain();
	const wet = ctx.createGain();
	dry.gain.value = 0.8;
	wet.gain.value = 0.35;
	bus.connect(dry).connect(comp);
	bus.connect(verb).connect(wet).connect(comp);
	comp.connect(out).connect(ctx.destination);

	layerGains = LAYERS.map((L) => {
		const g = ctx!.createGain();
		g.gain.value = 0;
		g.connect(bus);
		const lp = ctx!.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = L.cut;
		lp.Q.value = 0.4;
		const breath = ctx!.createGain();
		breath.gain.value = 0.5;
		lp.connect(breath).connect(g);
		L.iv.forEach((iv, k) => {
			[0, 7].forEach((cents) => {
				const o = ctx!.createOscillator();
				const og = ctx!.createGain();
				o.type = "triangle";
				o.frequency.value = mtof(L.root + iv);
				o.detune.value = cents + (k % 2 ? -3 : 3);
				og.gain.value = 0.045;
				o.connect(og).connect(lp);
				o.start();
			});
		});
		// slow breathing: the cutoff and the level drift together
		const lfo = ctx!.createOscillator();
		const lg = ctx!.createGain();
		const lg2 = ctx!.createGain();
		lfo.frequency.value = 0.07 + Math.random() * 0.05;
		lg.gain.value = L.cut * 0.45;
		lg2.gain.value = 0.18;
		lfo.connect(lg).connect(lp.frequency);
		lfo.connect(lg2).connect(breath.gain);
		lfo.start();
		return g;
	});
}

function mixFor(i: number) {
	if (!ctx) return;
	const now = ctx.currentTime;
	layerGains.forEach((g, k) => {
		g.gain.cancelScheduledValues(now);
		g.gain.setValueAtTime(g.gain.value, now);
		g.gain.linearRampToValueAtTime(k === i ? 1 : 0, now + FADE);
	});
}

function setLevel(on: boolean, t = 0.4) {
	if (!ctx) return;
	out.gain.cancelScheduledValues(ctx.currentTime);
	out.gain.setTargetAtTime(on ? VOLUME : 0, ctx.currentTime, t / 3);
}

// Builds the audio once and runs it; called from the first gesture (anywhere on the page, or the button)
async function start() {
	if (!ctx) build();
	try {
		await ctx!.resume();
	} catch {
		return;
	}
	if (ctx!.state !== "running") return;
	started = true;
	mixFor(section);
	setLevel(true, 1.2);
}

// ---- notes: FM "plucked strings" on a pentatonic scale, through the same reverb bus ----
const NOTES: number[] = [];
for (let o = 0; o < 2; o++) PENTATONIC.forEach((s) => NOTES.push(PLUCK_ROOT + 12 + o * 12 + s));

let voices = 0;
let lastNotes: number[] = [];

function pluck(h01: number, pan: number, o: { vol?: number; ratio?: number; decay?: number; shift?: number; at?: number } = {}) {
	if (!ctx || muted || voices >= 24) return;
	// at most 8 notes a second
	const now = ctx.currentTime;
	lastNotes = lastNotes.filter((t) => now - t < 1);
	if (lastNotes.length >= 8) return;
	lastNotes.push(now);

	const midi = NOTES[Math.round(Math.min(1, Math.max(0, h01)) * (NOTES.length - 1))] + (o.shift ?? 0);
	const f = mtof(midi);
	const t = now + (o.at ?? 0);
	const decay = o.decay ?? 1.6;
	const car = ctx.createOscillator();
	const mod = ctx.createOscillator();
	const idx = ctx.createGain();
	const amp = ctx.createGain();
	const panner = ctx.createStereoPanner();
	car.frequency.value = f;
	mod.frequency.value = f * (o.ratio ?? 2);
	idx.gain.setValueAtTime(f * 2.8, t);
	idx.gain.exponentialRampToValueAtTime(f * 0.02 + 0.01, t + decay / 2);
	amp.gain.setValueAtTime(0.0001, t);
	amp.gain.linearRampToValueAtTime(o.vol ?? 0.08, t + 0.004);
	amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
	panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
	mod.connect(idx).connect(car.frequency);
	car.connect(amp).connect(panner).connect(bus);
	voices++;
	car.onended = () => voices--;
	car.start(t);
	mod.start(t);
	car.stop(t + decay + 0.05);
	mod.stop(t + decay + 0.05);
}

// a plain sine note with a soft attack and a long tail; it can start a little above its pitch and settle
function tone(freq: number, o: { vol: number; decay: number; attack?: number; glide?: number; at?: number }) {
	if (!ctx || muted) return;
	const t = ctx.currentTime + (o.at ?? 0);
	const osc = ctx.createOscillator();
	const amp = ctx.createGain();
	osc.type = "sine";
	if (o.glide) {
		osc.frequency.setValueAtTime(freq * o.glide, t);
		osc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
	} else {
		osc.frequency.value = freq;
	}
	amp.gain.setValueAtTime(0.0001, t);
	amp.gain.linearRampToValueAtTime(o.vol, t + (o.attack ?? 0.012));
	amp.gain.exponentialRampToValueAtTime(0.0001, t + o.decay);
	osc.connect(amp).connect(bus);
	osc.start(t);
	osc.stop(t + o.decay + 0.05);
}

// "Gota": when the hero's butterfly lands, one soft note like a drop of water, with a faint octave above it
function chime() {
	tone(mtof(76), { vol: 0.05, attack: 0.015, decay: 2.2, glide: 1.035 });
	tone(mtof(88), { vol: 0.01, decay: 0.9, at: 0.01 });
}

// touching the footer's garden: the part decides the voice (bloom bright, stem low and round, leaf in between)
// and where the plant stands decides the note, so sweeping across it plays a rising line
function onTouch(e: Event) {
	const { x01, part, strength } = (e as CustomEvent<{ x01: number; part: number; strength: number }>).detail;
	const vol = 0.035 + 0.075 * strength;
	if (part === 0) pluck(x01, x01 * 1.6 - 0.8, { vol, ratio: 3.5, decay: 1.6 });
	else if (part === 2) pluck(x01, x01 * 1.6 - 0.8, { vol, ratio: 2, decay: 0.9 });
	else pluck(x01, x01 * 1.6 - 0.8, { vol, ratio: 1, decay: 1.8, shift: -12 });
}

// a butterfly lands on a plant: the plant's note, with a faint octave above it
function onLand(e: Event) {
	const { x01 } = (e as CustomEvent<{ x01: number }>).detail;
	pluck(x01, x01 * 1.6 - 0.8, { vol: 0.07, ratio: 2, decay: 2.2 });
	pluck(x01, x01 * 1.6 - 0.8, { vol: 0.025, ratio: 3.5, decay: 1.4, shift: 12, at: 0.09 });
}

export function startSound(button: HTMLButtonElement | null) {
	const wave = button?.querySelector<SVGPolylineElement>(".sound__wave") ?? null;
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

	// idle (never pressed) and playing both keep the wave moving; only a muted wave goes flat
	const on = () => started && !muted;
	const flat = () => started && muted;
	const reflect = () => {
		button?.classList.toggle("is-muted", flat());
		button?.setAttribute("aria-pressed", on() ? "true" : "false");
		const label = on() ? "Silenciar" : "Escuchar";
		button?.setAttribute("aria-label", label);
		button?.setAttribute("data-tip", label);
	};
	reflect();

	// the wave: eight points riding two sines; it flattens when muted
	if (wave) {
		const xs = [1, 2.14, 3.29, 4.43, 5.57, 6.71, 7.86, 9];
		let amount = 1;
		const draw = () => {
			amount += 0.08 * ((flat() ? 0.08 : 1) - amount);
			const t = reduce ? 600 : performance.now() * 0.0022;
			const pts = xs.map((x, n) => {
				const i = t + 0.82 * n;
				const y = 5.05 + (5 + 1.55 * Math.sin(i) + 0.72 * Math.sin(0.54 * i + 1.2) - 5.05) * amount;
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			});
			wave.setAttribute("points", pts.join(" "));
			if (!reduce) requestAnimationFrame(draw);
		};
		draw();
	}

	// where she is on the page decides which layer is up
	const ids = SECTIONS.map(([id]) => id);
	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((en) => {
				if (!en.isIntersecting) return;
				const layer = SECTIONS[ids.indexOf(en.target.id)]?.[1];
				if (layer === undefined || layer === section) return;
				section = layer;
				mixFor(section);
			});
		},
		{ rootMargin: "-45% 0px -45% 0px" }, // the section crossing the middle of the screen
	);
	SECTIONS.forEach(([id]) => {
		const el = document.getElementById(id);
		if (el) io.observe(el);
	});

	// the first click, tap or key anywhere on the page turns the sound on (a press on the button itself is
	// handled by the button below)
	const EVENTS = ["pointerdown", "keydown", "touchend"];
	const begin = async (e: Event) => {
		if (button && e.target instanceof Node && button.contains(e.target)) return;
		EVENTS.forEach((n) => removeEventListener(n, begin, true));
		await start();
		reflect();
	};
	EVENTS.forEach((n) => addEventListener(n, begin, { capture: true, passive: true }));

	button?.addEventListener("click", async () => {
		EVENTS.forEach((n) => removeEventListener(n, begin, true)); // the button has taken over from here
		if (!started) {
			// first press: this is the gesture that lets the browser play sound
			await start();
		} else {
			muted = !muted;
			setLevel(!muted, 0.25);
		}
		reflect();
	});

	addEventListener("butterfly:perch", chime);
	addEventListener("garden:touch", onTouch);
	addEventListener("garden:land", onLand);
	document.addEventListener("visibilitychange", () => {
		if (!ctx) return;
		if (document.hidden) ctx.suspend();
		else if (!muted) ctx.resume();
	});
}
