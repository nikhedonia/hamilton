# Hamilton — phase space playground

An interactive web UI for exploring the phase space of conservative physical
systems. Type a **Hamiltonian** or a **Lagrangian**, press play, and watch a
cloud of trajectories trace out the flow. The energy landscape is drawn as a
living heat map behind the trajectories.

Built with **React + TypeScript + WebGL2**. Numerical integration runs in a
**Web Worker**; the main thread only uploads buffers and draws.

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # unit tests for the parser, derivatives and integrator
npm run build      # type-check + production bundle (base /hamilton/)
npm run preview    # serve the production build at /hamilton/
```

WebGL2 is required. A dedicated or integrated GPU is recommended; the renderer
uses instanced-free, single-buffer line drawing and point sprites, so it also
works on modest hardware.

## Deployment

The production site is built for:

```text
https://nikhedonia.net/hamilton/
```

`.github/workflows/deploy.yml` runs on every push to `main` or `master` (and
manually via **Run workflow**):

1. installs with `npm ci`,
2. runs the linter,
3. runs the test suite,
4. builds the production bundle (Vite base `/hamilton/`),
5. uploads `dist/` as a GitHub Pages artifact,
6. deploys through the `github-pages` environment.

To enable it in the repository, open **Settings → Pages** and set the source to
**GitHub Actions**.

The `/hamilton/` path assumes that `nikhedonia.net` is configured as the custom
domain on the **user/organization Pages site** (`nikhedonia.github.io`). Project
sites inherit the custom domain and are served under `/<repository>/`. This
repository therefore does **not** include a `CNAME` file: adding one to a project
site would make GitHub Pages serve that project at the domain root instead of
`/hamilton/`. The DNS for the apex domain belongs to the user-site repository.

The project is built with Vite base `/hamilton/`; the dev server stays at `/`.
The base matches the repository name. If the repository is renamed, update
`base` in `vite.config.ts` and the examples in this section. Until the custom
domain is live, the same deployment is available at
`https://<account>.github.io/hamilton/`.

A local production preview is available at the URL Vite prints, normally:

```text
http://localhost:4173/hamilton/
```

## What it does

- Lets you enter **H(q, p)** or **L(q, q̇)** with a small mathematical
  expression language.
- Symbolically differentiates the expression and compiles it to fast plain
  JavaScript functions.
- Integrates the equations of motion with a fixed-step **fourth-order
  Runge–Kutta** method.
- Renders a **live flow** (particles + fading trails) or a static **phase
  portrait** (many trajectories seeded across the current view).
- Draws a **total-energy heat map** and an optional **vector field** behind the
  trajectories.
- Supports **1 or 2 degrees of freedom**. For 2 DOF you choose which pair of
  coordinates is shown; the hidden coordinates are held at zero for the energy
  slice.
- Ships with **21 built-in systems**: harmonic and anharmonic oscillators, free
  particle, pendulum, double wells, Morse and relativistic potentials, a
  magnetic field, coupled and double pendulums, Hénon–Heiles, a softened Kepler
  potential, and Lagrangian counterparts of the same physics.
- Includes a built-in **field guide** that explains phase space, Hamiltonians,
  Lagrangians, the visual layers, the numerics and the expression language.

## Using it

1. Read the **Guide** (top bar, or the card at the bottom of the sidebar) if you
   want the physics and a tour of the visualisation.
2. Pick an example on the left, or write your own expression.
3. The variables depend on the system kind:

   | System | 1 DOF | 2 DOF |
   | --- | --- | --- |
   | Hamiltonian | `q`, `p` (or `q1`, `p1`) | `q1`, `p1`, `q2`, `p2` |
   | Lagrangian | `q`, `v` (or `qdot`) | `q1`, `v1`, `q2`, `v2` |

   `v` is the velocity `q̇`, not the canonical momentum. The canonical momentum
   is computed automatically as `∂L/∂v`.

4. Any identifier that is not a coordinate becomes a **parameter** with a
   numeric value and a control in the sidebar. For example:

   ```text
   p^2/2 + a*q^4/4 - b*q^2/2
   ```

   creates sliders/inputs for `a` and `b`.

5. Use the usual operators `+ - * / ^` (or `**`), parentheses, and the functions
   `sin cos tan asin acos atan sinh cosh tanh exp log ln log10 sqrt abs sign min
   max pow atan2`. Constants: `pi`, `π`, `e`, `tau`.

6. Interact with the canvas:
   - **Drag** to pan.
   - **Scroll** to zoom around the pointer.
   - **Space** toggles play/pause (when focus is not in a control).
   - **R** resets the view and trajectories.
   - In **Portrait** mode, panning re-seeds the portrait after a short debounce.

## Field guide

The **Guide** button opens a long-form page inside the app. It covers:

- what a point in phase space means, and why trajectories do not cross;
- Hamilton's equations, canonical momentum and energy conservation;
- the action principle, Euler–Lagrange equations, the mass matrix and the
  Legendre transform from `L` to `H`;
- how to read the energy field, vector arrows, trails, heads and portrait;
- why a 2D degree-of-freedom system shows a slice of a 4D phase space;
- RK4, step size, energy drift and respawns;
- the expression language and parameters;
- a curated set of examples that load directly into the playground.

## The mathematics

### Hamiltonian systems

For a Hamiltonian `H(q, p)`, Hamilton's equations are

```text
q̇_i =  ∂H/∂p_i
ṗ_i = −∂H/∂q_i
```

The phase space is the `(q, p)` plane for one degree of freedom. The code
compiles the partial derivatives symbolically and evaluates them in the worker.

### Lagrangian systems

For a Lagrangian `L(q, v)`, the Euler–Lagrange equations are

```text
d/dt (∂L/∂v_i) − ∂L/∂q_i = 0
```

Expanding the total derivative gives a small linear system for the
accelerations:

```text
M_ij = ∂²L / ∂v_i ∂v_j
C_ij = ∂²L / ∂v_i ∂q_j
b_i  = ∂L/∂q_i − Σ_j C_ij v_j
M a  = b
```

The system is solved with a pivoted 1×1 / 2×2 solve (and a generic fallback).
The canonical momentum and total energy are

```text
p_i = ∂L/∂v_i
H   = Σ_i p_i v_i − L
```

so the same energy heat map and drift diagnostics work for both formalisms.
Trajectories are integrated in `(q, v)` coordinates for Lagrangians.

### Integrator

A classical fixed-step RK4 step is applied to the full state
`[q1, w1, q2, w2, ...]`:

```text
k1 = f(y)
k2 = f(y + h/2 k1)
k3 = f(y + h/2 k2)
k4 = f(y + h k3)
y ← y + h/6 (k1 + 2k2 + 2k3 + k4)
```

The default step and speed are chosen per example. If an orbit becomes stiff or
singular, reduce the integration step; the simulation respawns particles that
become non-finite or leave the visible region.

### Energy slice

For two degrees of freedom the full phase space is four-dimensional. The plot
shows a two-dimensional projection. The background energy map evaluates `H` on
that projected plane with all hidden coordinates set to zero. The trajectories
themselves move in the full four-dimensional space, so they can leave the slice;
that is part of the point of a phase-space projection.

## Rendering and performance

- **WebGL2** draws:
  - an energy background as a single `R8` texture on a quad, with contour
    bands and a dark plasma palette;
  - a grid and axis frame;
  - trajectories as `GL_LINES`;
  - particle heads as soft additive point sprites.
- **Trails** use a ring buffer in the GPU. Each snapshot writes one segment per
  particle with a slot index; the vertex shader fades segments by age, so the
  CPU never rebuilds the whole trail geometry.
- **Web Worker** owns the compiled system, the particle states, RK4, the energy
  field, the vector field and the static portrait computation. It posts
  transferable typed arrays, avoiding copies.
- The main thread runs a `requestAnimationFrame` loop that only issues draw
  calls and uploads already-computed data.

## Project map

```text
src/
  core/
    expr.ts        expression lexer/parser, simplifier, symbolic differentiation,
                   JavaScript code generation
    system.ts      Hamiltonian and Lagrangian compilation, coordinates, aliases
    integrator.ts  RK4 step
    presets.ts     example systems
    ticks.ts       nice axis/tick helpers
    types.ts       shared types
  sim/
    messages.ts    typed worker protocol
    sim.worker.ts  field, live cloud and portrait computation
  gl/
    renderer.ts    WebGL2 programs, buffers, trail ring buffer, projection
  components/
    PhaseCanvas.tsx  canvas, worker lifecycle, pointer/wheel interaction, SVG ticks
    InfoPage.tsx     field guide: phase space, H/L, visualisation, syntax
    InfoPage.css
  hooks/
    useDebouncedValue.ts
  App.tsx          controls, presets, parameter editing, HUD
tests/             vitest unit tests, including every built-in preset
.github/
  workflows/
    deploy.yml     GitHub Pages build + deploy workflow
public/
  .nojekyll        keep GitHub Pages from running Jekyll
  favicon.svg
```

## Worker protocol (summary)

- `field` → energy texture, `eMin/eMax`, vector-field arrows.
- `live-start` → seed particles, post `live-seeded`, then stream
  `live-snapshot` positions.
- `live-pause` / `live-resume` → freeze/resume without losing state.
- `live-view` / `live-settings` → update respawn bounds and speed/step.
- `portrait` → chunked integration of a seed grid, `portrait-progress`, then a
  transferable line buffer.

## Tests

`npm test` covers:

- operator precedence, functions, constants and parse errors;
- symbolic derivatives of polynomials, trigonometric functions and parameters;
- Hamiltonian flows (harmonic, pendulum, coupled 2D, Hénon–Heiles);
- Lagrangian accelerations, including the mixed `∂²L/∂v∂q` term and a 2D
  mass-matrix solve;
- RK4 energy conservation for Hamiltonian and Lagrangian systems;
- compilation, finite energies and short integrations for every built-in
  preset;
- tick formatting edge cases.

## Limitations and notes

- Conservative, time-independent systems only. Adding explicit time dependence
  would require passing `t` into the compiled functions.
- Up to two degrees of freedom in the UI (the generic solver and renderer can be
  extended).
- The energy background is a slice of the full phase space for 2 DOF.
- Symbolic derivatives can grow quickly for pathological expressions. `min`,
  `max` and `sign` are available for evaluation but `min`/`max` are not
  differentiated; the app reports this instead of guessing.
- The expression compiler uses `new Function`. If you deploy under a strict
  Content-Security-Policy, allow `unsafe-eval` for the worker or replace the
  compiler with an interpreter.
- Numerical singularities (for example `1/q` or a zero mass matrix) are not
  regularized; the affected particles are respawned and the portrait stops
  those trajectories.
