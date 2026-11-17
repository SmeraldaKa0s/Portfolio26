// Scroll-linked reveal for [data-scroll-reveal] text (Experience and Info).
//
// Unlike [data-reveal] (a one-shot timed transition), this follows the scroll position: each element's
// progress goes 0 → 1 while its own height crosses the bottom edge of the viewport, and an overdamped
// spring chases that progress, so the text trails the scroll slightly and settles ~0.6s after it stops.
// Scrolling back up reverses it. Progress drives both properties together: opacity = x, y = 80px·(1 − x).
//
// The hidden state lives in global.css under html.reveal-on, so without JS everything stays visible.
// With prefers-reduced-motion only the opacity follows; nothing moves.

const RISE = 80; // px the text rises while revealing
const STIFFNESS = 150;
const DAMPING = 40; // damping ratio ≈ 1.6: no overshoot
const STEP = 1 / 240; // integration substep (the spring is stiff)
const REST = 0.001;

type Item = { el: HTMLElement; x: number; v: number; target: number };

export function startScrollReveal() {
	const els = [...document.querySelectorAll<HTMLElement>("[data-scroll-reveal]")];
	if (!els.length) return;
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const items: Item[] = els.map((el) => ({ el, x: 0, v: 0, target: 0 }));

	// progress from the untransformed box: the current offset is subtracted back out
	function measure() {
		const vh = innerHeight;
		for (const it of items) {
			const r = it.el.getBoundingClientRect();
			const top = r.top - (still ? 0 : RISE * (1 - it.x));
			it.target = Math.min(1, Math.max(0, (vh - top) / Math.max(1, r.height)));
		}
	}

	function write(it: Item) {
		it.el.style.opacity = String(it.x);
		it.el.style.transform = still ? "none" : `perspective(1200px) translateY(${(RISE * (1 - it.x)).toFixed(2)}px)`;
	}

	// anything already scrolled past on load (restored scroll, anchor jump) starts revealed
	measure();
	for (const it of items) {
		if (it.el.getBoundingClientRect().bottom < 0) it.x = it.target;
		write(it);
	}

	let raf = 0;
	let last = 0;
	function frame(now: number) {
		raf = 0;
		const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
		last = now;
		measure();
		let moving = false;
		for (const it of items) {
			if (Math.abs(it.x - it.target) < REST && Math.abs(it.v) < REST) {
				if (it.x !== it.target) {
					it.x = it.target;
					it.v = 0;
					write(it);
				}
				continue;
			}
			for (let t = 0; t < dt; t += STEP) {
				const h = Math.min(STEP, dt - t);
				it.v += (-STIFFNESS * (it.x - it.target) - DAMPING * it.v) * h;
				it.x += it.v * h;
			}
			write(it);
			moving = true;
		}
		if (moving) raf = requestAnimationFrame(frame);
		else last = 0;
	}
	const kick = () => {
		if (!raf) raf = requestAnimationFrame(frame);
	};

	addEventListener("scroll", kick, { passive: true });
	addEventListener("resize", kick);
	addEventListener("load", kick);
	kick();
}
