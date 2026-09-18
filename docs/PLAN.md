# Design and implementation plan

## Goal

A monitor in an office runs a gallery of clocks that are (1) genuinely
readable, (2) built on a real idea from science or computing, (3) visually
arresting from across the room, and (4) able to explain themselves. The owner
can switch between clocks, and visitors can learn how the one on screen works.

## Decisions

### Server-authoritative state over one SSE stream

The requirement to use Datastar pushed the design towards hypermedia on the
server. The shared state is small: current clock, explainer open, picker open,
auto-cycle period and deadline. It lives in a Go hub guarded by a mutex; every
connected page subscribes. Actions are `POST /api/*` endpoints that mutate the
hub and return `204`. The stream then pushes signal patches and re-rendered
HTML fragments to every client.

Why this is better than local state:

- **Phone remote for free.** `/remote` is just another subscriber. Pressing
  "Explain on screen" on a phone slides the explainer open on the monitor.
- **Several screens stay in sync** without extra code.
- **Reconnects are self-healing.** The first event on every (re)connection is
  the full state, and Datastar's `retry: 'always'` reconnects forever, which
  matters for a kiosk that runs for weeks.
- **Content is server-rendered.** Explainers are HTML files with a metadata
  header, rendered with `html/template` and morphed into place.

`?clock=<id>` is a "solo" mode that bypasses the stream and state; it exists
for previews, screenshot tests and independent second screens.

### Pixels stay on the client

Clocks need 60 fps animation, WebGL and per-frame physics, so rendering is
client-side. The only bridge from Datastar to the runtime is
`data-effect="window.nerd.mount($clock)"`. Each clock is an ES module with a
`create(host)` function; the runtime provides DPR-aware canvases, a virtual
clock (`?at=`, `?speed=`) and cross-fade transitions, and it isolates crashes
so that one broken clock can't freeze the display.

### No build step, one binary

Datastar is vendored (v1.0.3) and all web assets are embedded with `go:embed`.
The office machine needs no internet access and no Node toolchain. `-dev`
serves from disk for iteration.

### Clocks are two files, no registry

`web/static/clocks/<id>.js` plus `web/content/clocks/<id>.html`. The catalog
is discovered from the content directory, and a test asserts every entry has a
module. That made it possible to build clocks in parallel without merge
conflicts.

## Clock selection criteria

Each clock needed a distinct *mechanism* rather than a different skin on
digits. Across the set there is a spread of mathematics (fractals, Fourier,
space-filling curves), physics (pendulums, orbits), emergence (Life,
reaction–diffusion), computing (sorting, Hanoi, Unix time), communications
(Enigma, WWVB), astronomy (live sky) and history (cuneiform, Maya), and a spread
of rendering techniques (WebGL shaders, simulation, vector beam, skeuomorphic
hardware).

## Phases

1. Core: Go hub and SSE, templates (display, remote, fragments), runtime,
   styling, shared glyph and time libraries, screenshot tooling, Go tests.
2. Reference clock (Pendulum Wave) and authoring guide.
3. The other 15 clocks, built in five themed batches in parallel, each
   verified visually by screenshots at several times and aspect ratios.
4. Integration review: consistency, performance, explainer accuracy, e2e
   check of keyboard, remote and multi-screen sync.
