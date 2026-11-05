// Where Work's first image is, shared so the hero's butterfly can fly to it. workOrbit.ts keeps it updated.
// Measured from the top-left of Work's pinned screen, in CSS pixels: x, y are the image's centre and
// hw, hh half its size. Until the camera reaches the far view it holds where the image will be seen from there.
export const firstProject = { x: 0, y: 0, hw: 0, hh: 0, ready: false };

// The butterfly's flights from one project to the next, and where each project's first image is right now.
// Every moment in `list` is a point of the camera's progress: she shows up (appear), starts to fly (lift),
// leaves the screen's foot to go with the turn (turn), lands (arrive) and the next project ends (end).
export const hops = {
	progress: 0,
	list: [] as { appear: number; lift: number; turn: number; arrive: number; end: number }[],
	targets: [] as { x: number; y: number; hw: number; hh: number }[],
};
