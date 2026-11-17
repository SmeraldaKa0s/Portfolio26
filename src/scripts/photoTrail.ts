// Iridescent cursor trail over the Info photo.
//
// A WebGL2 canvas sits on top of the <img> and redraws the photo. Two passes per frame:
//  1. Trail: the cursor's movement is painted into a ping-pong texture. Hue encodes the direction of
//     travel, value encodes strength; the previous frame is blurred, pushed outward, swirled a little and
//     decayed, so the trail smears and fades in ~0.5s.
//  2. Display: each pixel reads the trail, shifts the photo along that direction with 24 weighted samples,
//     and splits red/blue across them. The split is what reads as iridescence.
//
// The <img> stays underneath as the fallback (no WebGL2, touch-only, reduced motion) and for no-JS.
// The canvas only renders while the cursor moves and the photo is on screen.

/** Tunables, from most to least visible. */
const T = {
	strength: 0.46, // how far the photo is displaced inside the trail
	radius: 0.26, // brush size (× ~13% of the box height)
	decay: 0.23, // lower = shorter trail
	chroma: 1, // red/blue split
	blur: 0.5, // length of the smear
	spread: 0.6, // how much the trail drifts outward as it fades
	follow: 0.25, // fraction of the way the brush moves toward the cursor each frame
	dpr: 1.5, // canvas resolution cap
};

const FRAME_MS = 16; // the trail's decay is per frame, so it is pinned to 60fps
const IDLE_FRAMES = 90; // frames without movement before the loop stops (trail is gone by then)

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HSV = `
vec3 rgb2hsv(vec3 c) {
	vec4 K = vec4(0., -1. / 3., 2. / 3., -1.);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	return vec3(abs(q.z + (q.w - q.y) / (6. * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

const TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPrev;
uniform vec2 uMouse, uPrevMouse, uRes;
uniform float uRadius, uDecay, uSpread;
const float PI = 3.1415926, TWOPI = 6.2831852;
${HSV}
vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1., 2. / 3., 1. / 3., 3.);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6. - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0., 1.), c.y);
}
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
// small swirl that makes the fading trail look oily
vec2 liquify(vec2 st, vec2 dir, float strength) {
	float ar = uRes.x / uRes.y;
	st.x *= ar;
	st -= dir * 0.005;
	float amp = smoothstep(0., 1., strength) * 0.005;
	for (float i = 1.; i <= 5.; i++) {
		st = st * rot(i / 5. * TWOPI);
		st += vec2(amp * cos(i * 5. * st.y + strength), amp * sin(i * 5. * st.x + strength));
	}
	st.x /= ar;
	return st;
}
void main() {
	float ar = uRes.x / uRes.y;
	vec2 av = vec2(ar, 1.);
	vec2 uv = vUv, cuv = uv * av;
	vec2 dir = (uMouse - uPrevMouse) * av;
	float dist = length(dir);
	dir = dist > 0. ? dir / dist : vec2(1., 0.);
	float angle = atan(dir.y, dir.x);
	if (angle < 0.) angle += TWOPI;

	vec3 hsv = rgb2hsv(texture(uPrev, uv).rgb);
	float pa = hsv.x * TWOPI;
	uv = liquify(uv, vec2(cos(pa), sin(pa)), hsv.z);

	// distance to the segment the cursor covered this frame
	float t = dist > 0. ? clamp(dot(cuv - uPrevMouse * av, dir) / dist, 0., 1.) : 0.;
	float dl = distance(cuv, mix(uPrevMouse, uMouse, t) * av);
	float rad = uRadius * 0.4 * mix(ar, 1., 0.5) * mix(0.5, 1., clamp(dist * 20., 0., 1.));
	float s = smoothstep(rad, rad * 0.21, dl);
	s *= s;

	vec2 suv = mix(uv, uv / (1. + uSpread * 0.03) + uSpread * 0.015, uSpread);
	float br = 0.003;
	vec3 last = texture(uPrev, suv).rgb * 0.4
		+ texture(uPrev, suv + vec2(br, 0.)).rgb * 0.15
		+ texture(uPrev, suv - vec2(br, 0.)).rgb * 0.15
		+ texture(uPrev, suv + vec2(0., br)).rgb * 0.15
		+ texture(uPrev, suv - vec2(0., br)).rgb * 0.15;
	last = pow(last, vec3(2.2)) * pow(uDecay, 0.2);
	vec3 brush = pow(hsv2rgb(vec3(angle / TWOPI, 1., 1.)), vec3(2.2));
	float k = clamp(min(1., dist * 10.) * s, 0., 1.);
	fragColor = vec4(pow(mix(last, brush, k), vec3(1. / 2.2)), 1.);
}`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage, uTrail;
uniform vec2 uScale, uOffset; // cover-fit + object-position, in image uv
uniform float uStrength, uBlur, uChroma;
const float PI = 3.1415926;
${HSV}
vec4 photo(vec2 uv) { return texture(uImage, uv * uScale + uOffset); }
void main() {
	vec3 tr = rgb2hsv(texture(uTrail, vUv).rgb);
	float a = tr.x * 2. * PI;
	vec2 dir = vec2(cos(a), sin(a)) * tr.z * uStrength * 1.5;
	if (dot(dir, dir) <= 1e-8) { fragColor = photo(vUv); return; }
	vec2 shift = dir * 0.4;
	float scale = 0.0001 + uBlur * 0.5;
	vec4 col = vec4(0.);
	float tw = 0.;
	for (int i = 0; i < 24; i++) {
		float w = exp(-0.5 * pow(float(i) / 12., 2.));
		vec2 off = shift * (1.5 + scale) * mix(1., float(i) / 24., scale);
		vec2 st = vUv - off;
		vec4 s = photo(st);
		vec2 ca = off * uChroma * 0.12;
		s.r = photo(st - ca).r;
		s.b = photo(st + ca).b;
		col += w * s;
		tw += w;
	}
	fragColor = col / tw;
}`;

type Program = { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
	const s = gl.createShader(type)!;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
	return s;
}

function program(gl: WebGL2RenderingContext, frag: string): Program {
	const p = gl.createProgram()!;
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
	gl.bindAttribLocation(p, 0, "aPos");
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
	const u: Record<string, WebGLUniformLocation> = {};
	const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
	for (let i = 0; i < n; i++) {
		const { name } = gl.getActiveUniform(p, i)!;
		u[name] = gl.getUniformLocation(p, name)!;
	}
	return { p, u };
}

/** `root` holds the <img> and an empty <canvas>; it gets `.is-gl` once the canvas is drawing. */
export function startPhotoTrail(root: HTMLElement) {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
	const img = root.querySelector("img");
	const canvas = root.querySelector("canvas");
	if (!img || !canvas) return;
	const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
	if (!gl) return;

	let trail: Program, display: Program;
	try {
		trail = program(gl, TRAIL_FRAG);
		display = program(gl, DISPLAY_FRAG);
	} catch {
		return;
	}
	const half = !!gl.getExtension("EXT_color_buffer_float");

	// one triangle covering the canvas
	gl.bindVertexArray(gl.createVertexArray());
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	const makeTex = () => {
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	};

	const pp = [0, 1].map(() => ({ tex: makeTex(), fbo: gl.createFramebuffer()! }));
	let read = 0;
	let W = 1;
	let H = 1;
	let rect = root.getBoundingClientRect();

	// cover-fit and object-position of the <img>, so the canvas lines up with it exactly
	const imgTex = makeTex();
	let imgAspect = 1;
	let ready = false;
	const scale = [1, 1];
	const offset = [0, 0];
	function fit() {
		const ca = W / H;
		const sx = ca > imgAspect ? 1 : ca / imgAspect;
		const sy = ca > imgAspect ? imgAspect / ca : 1;
		const [px, py] = getComputedStyle(img!).objectPosition.split(" ").map((v) => parseFloat(v) / 100);
		scale[0] = sx;
		scale[1] = sy;
		offset[0] = (px ?? 0.5) * (1 - sx);
		offset[1] = (1 - (py ?? 0.5)) * (1 - sy); // uv y runs bottom-up
	}

	function resize() {
		rect = root.getBoundingClientRect();
		W = Math.max(1, Math.round(rect.width * T.dpr));
		H = Math.max(1, Math.round(rect.height * T.dpr));
		canvas!.width = W;
		canvas!.height = H;
		for (const t of pp) {
			gl!.bindTexture(gl!.TEXTURE_2D, t.tex);
			gl!.texImage2D(gl!.TEXTURE_2D, 0, half ? gl!.RGBA16F : gl!.RGBA8, W, H, 0, gl!.RGBA, half ? gl!.HALF_FLOAT : gl!.UNSIGNED_BYTE, null);
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, t.fbo);
			gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, t.tex, 0);
			gl!.clearColor(0, 0, 0, 1);
			gl!.clear(gl!.COLOR_BUFFER_BIT);
		}
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
		fit();
		idle = 0;
		kick();
	}

	const source = new Image();
	source.src = img.currentSrc || img.src;
	source.decode().then(() => {
		gl.bindTexture(gl.TEXTURE_2D, imgTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		// no mipmaps: the displaced lookups break uv derivatives at the trail's edge and pick a blurry level there
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		imgAspect = source.naturalWidth / source.naturalHeight;
		fit();
		ready = true;
		idle = 0;
		kick();
	}, () => {});

	// the brush eases toward the cursor; mouse is tracked on the whole window so the trail can leave the photo
	const target = { x: 0.5, y: 0.5 };
	const cur = { x: 0.5, y: 0.5 };
	const prev = { x: 0.5, y: 0.5 };
	let first = true;
	let idle = 0;
	addEventListener("pointermove", (e) => {
		if (e.pointerType !== "mouse") return;
		rect = root.getBoundingClientRect(); // the reveal animation and scrolling both move it
		target.x = (e.clientX - rect.left) / rect.width;
		target.y = 1 - (e.clientY - rect.top) / rect.height;
		if (first) {
			cur.x = prev.x = target.x;
			cur.y = prev.y = target.y;
			first = false;
		}
		idle = 0;
		kick();
	}, { passive: true });

	let raf = 0;
	let last = 0;
	let inView = false;
	function kick() {
		if (!raf && inView && ready) raf = requestAnimationFrame(frame);
	}
	function frame(now: number) {
		raf = 0;
		if (!inView) return;
		if (now - last < FRAME_MS) {
			raf = requestAnimationFrame(frame);
			return;
		}
		last = now;

		prev.x = cur.x;
		prev.y = cur.y;
		cur.x += (target.x - cur.x) * T.follow;
		cur.y += (target.y - cur.y) * T.follow;

		const write = 1 - read;
		gl!.bindFramebuffer(gl!.FRAMEBUFFER, pp[write].fbo);
		gl!.viewport(0, 0, W, H);
		gl!.useProgram(trail.p);
		gl!.activeTexture(gl!.TEXTURE0);
		gl!.bindTexture(gl!.TEXTURE_2D, pp[read].tex);
		gl!.uniform1i(trail.u.uPrev, 0);
		gl!.uniform2f(trail.u.uMouse, cur.x, cur.y);
		gl!.uniform2f(trail.u.uPrevMouse, prev.x, prev.y);
		gl!.uniform2f(trail.u.uRes, W, H);
		gl!.uniform1f(trail.u.uRadius, T.radius);
		gl!.uniform1f(trail.u.uDecay, T.decay);
		gl!.uniform1f(trail.u.uSpread, T.spread);
		gl!.drawArrays(gl!.TRIANGLES, 0, 3);

		gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
		gl!.useProgram(display.p);
		gl!.activeTexture(gl!.TEXTURE0);
		gl!.bindTexture(gl!.TEXTURE_2D, imgTex);
		gl!.activeTexture(gl!.TEXTURE1);
		gl!.bindTexture(gl!.TEXTURE_2D, pp[write].tex);
		gl!.uniform1i(display.u.uImage, 0);
		gl!.uniform1i(display.u.uTrail, 1);
		gl!.uniform2f(display.u.uScale, scale[0], scale[1]);
		gl!.uniform2f(display.u.uOffset, offset[0], offset[1]);
		gl!.uniform1f(display.u.uStrength, T.strength);
		gl!.uniform1f(display.u.uBlur, T.blur);
		gl!.uniform1f(display.u.uChroma, T.chroma);
		gl!.drawArrays(gl!.TRIANGLES, 0, 3);
		read = write;
		root.classList.add("is-gl");

		const still = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) < 1e-5;
		idle = still ? idle + 1 : 0;
		if (idle < IDLE_FRAMES) raf = requestAnimationFrame(frame);
	}

	new IntersectionObserver(([e]) => {
		inView = e.isIntersecting;
		if (inView) {
			rect = root.getBoundingClientRect();
			idle = 0;
			kick();
		}
	}).observe(root);
	new ResizeObserver(resize).observe(root);
	canvas.addEventListener("webglcontextlost", () => root.classList.remove("is-gl"));
}
