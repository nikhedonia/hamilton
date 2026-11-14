import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { presetById, type Preset } from '../core/presets'
import './InfoPage.css'

interface InfoPageProps {
  onClose: () => void
  onLoadPreset: (preset: Preset) => void
}

const TRY_IDS = [
  'harmonic',
  'pendulum',
  'duffing',
  'magnetic',
  'double-pendulum',
  'kepler',
  'lagrangian-pendulum',
  'lagrangian-double-pendulum',
]
const TRY_PRESETS = TRY_IDS.map((id) => presetById(id))

function Formula({ children }: { children: ReactNode }) {
  return <div className="guide-formula">{children}</div>
}

function Figure({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="guide-figure">
      {children}
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

function HarmonicDiagram() {
  return (
    <svg className="guide-svg" viewBox="0 0 340 230" role="img" aria-labelledby="harmonic-diagram-title">
      <title id="harmonic-diagram-title">Concentric phase-space orbits with clockwise arrows</title>
      <defs>
        <radialGradient id="harmonic-bg" cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="#111c36" />
          <stop offset="100%" stopColor="#05070e" />
        </radialGradient>
        <marker id="harmonic-arrow" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#a9caff" />
        </marker>
      </defs>
      <rect width="340" height="230" rx="14" fill="url(#harmonic-bg)" />
      <g stroke="rgba(127,176,255,0.10)" strokeWidth="1">
        <line x1="18" y1="115" x2="322" y2="115" />
        <line x1="170" y1="18" x2="170" y2="212" />
        <line x1="18" y1="55" x2="322" y2="55" strokeDasharray="2 6" />
        <line x1="18" y1="175" x2="322" y2="175" strokeDasharray="2 6" />
        <line x1="95" y1="18" x2="95" y2="212" strokeDasharray="2 6" />
        <line x1="245" y1="18" x2="245" y2="212" strokeDasharray="2 6" />
      </g>
      <g fill="none" stroke="#7fb0ff">
        <circle cx="170" cy="115" r="28" strokeOpacity="0.95" />
        <circle cx="170" cy="115" r="56" strokeOpacity="0.62" />
        <circle cx="170" cy="115" r="84" strokeOpacity="0.36" />
      </g>
      <g stroke="#bcd8ff" strokeWidth="1.6" fill="none" markerEnd="url(#harmonic-arrow)">
        <path d="M 170 87 A 28 28 0 0 1 198 115" />
        <path d="M 170 59 A 56 56 0 0 1 226 115" />
        <path d="M 170 31 A 84 84 0 0 1 254 115" />
      </g>
      <circle cx="170" cy="115" r="3.2" fill="#fff5a4" />
      <text x="305" y="108" className="guide-svg-label" textAnchor="end">q</text>
      <text x="178" y="34" className="guide-svg-label">p</text>
      <text x="183" y="121" className="guide-svg-label guide-svg-label--muted">center</text>
    </svg>
  )
}

function PendulumDiagram() {
  return (
    <svg className="guide-svg" viewBox="0 0 380 250" role="img" aria-labelledby="pendulum-diagram-title">
      <title id="pendulum-diagram-title">Pendulum phase portrait with a separatrix, libration and rotation</title>
      <defs>
        <marker id="pendulum-orange" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#ffb37a" />
        </marker>
        <marker id="pendulum-blue" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#8ab6ff" />
        </marker>
        <marker id="pendulum-purple" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#c59dff" />
        </marker>
      </defs>
      <rect width="380" height="250" rx="14" fill="#070b14" />
      <g stroke="rgba(127,176,255,0.10)" strokeWidth="1">
        <line x1="24" y1="125" x2="356" y2="125" />
        <line x1="190" y1="20" x2="190" y2="230" />
      </g>
      <path
        d="M 60 125 C 115 48, 265 48, 320 125 C 265 202, 115 202, 60 125 Z"
        fill="rgba(255, 179, 122, 0.045)"
        stroke="#ffb37a"
        strokeOpacity="0.9"
        strokeWidth="1.8"
      />
      <path
        d="M 105 125 C 140 95, 240 95, 275 125 C 240 155, 140 155, 105 125 Z"
        fill="none"
        stroke="#8ab6ff"
        strokeOpacity="0.9"
      />
      <ellipse cx="190" cy="125" rx="35" ry="17" fill="none" stroke="#8ab6ff" strokeOpacity="0.55" />
      <path
        d="M 60 70 C 100 45, 140 85, 190 65 S 280 45, 320 70"
        fill="none"
        stroke="#c59dff"
        strokeOpacity="0.8"
        strokeWidth="1.3"
      />
      <path
        d="M 60 180 C 100 205, 140 165, 190 185 S 280 205, 320 180"
        fill="none"
        stroke="#c59dff"
        strokeOpacity="0.8"
        strokeWidth="1.3"
      />
      <g fill="none" strokeWidth="1.5">
        <path d="M 190 108 A 17 17 0 0 1 207 125" stroke="#8ab6ff" markerEnd="url(#pendulum-blue)" />
        <path d="M 190 90 A 35 35 0 0 1 225 125" stroke="#8ab6ff" markerEnd="url(#pendulum-blue)" />
        <path d="M 105 101 C 120 91, 135 86, 150 84" stroke="#ffb37a" markerEnd="url(#pendulum-orange)" />
        <path d="M 275 149 C 260 159, 245 164, 230 166" stroke="#ffb37a" markerEnd="url(#pendulum-orange)" />
        <path d="M 100 61 C 115 54, 130 54, 145 57" stroke="#c59dff" markerEnd="url(#pendulum-purple)" />
        <path d="M 250 174 C 235 181, 220 181, 205 178" stroke="#c59dff" markerEnd="url(#pendulum-purple)" />
      </g>
      <circle cx="60" cy="125" r="3.6" fill="#ffb37a" />
      <circle cx="320" cy="125" r="3.6" fill="#ffb37a" />
      <text x="60" y="146" className="guide-svg-label" textAnchor="middle">−π</text>
      <text x="320" y="146" className="guide-svg-label" textAnchor="middle">π</text>
      <text x="190" y="238" className="guide-svg-label guide-svg-label--muted" textAnchor="middle">libration</text>
      <text x="330" y="58" className="guide-svg-label guide-svg-label--muted" textAnchor="end">rotation</text>
      <text x="330" y="196" className="guide-svg-label guide-svg-label--muted" textAnchor="end">separatrix</text>
      <text x="330" y="112" className="guide-svg-label" textAnchor="end">saddle</text>
    </svg>
  )
}

function SliceDiagram() {
  return (
    <svg className="guide-svg" viewBox="0 0 380 250" role="img" aria-labelledby="slice-diagram-title">
      <title id="slice-diagram-title">A two-dimensional slice through a four-dimensional phase space</title>
      <defs>
        <linearGradient id="slice-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(127,176,255,0.18)" />
          <stop offset="100%" stopColor="rgba(127,176,255,0.045)" />
        </linearGradient>
      </defs>
      <rect width="380" height="250" rx="14" fill="#070b14" />
      <g stroke="rgba(127,176,255,0.16)" fill="none">
        <polygon points="62,78 245,46 320,96 137,128" fill="rgba(127,176,255,0.035)" />
        <polygon points="62,78 137,128 137,212 62,162" fill="rgba(127,176,255,0.025)" />
        <line x1="62" y1="78" x2="62" y2="162" />
        <line x1="245" y1="46" x2="320" y2="96" />
        <line x1="320" y1="96" x2="320" y2="180" />
        <line x1="245" y1="46" x2="245" y2="130" strokeDasharray="3 5" />
      </g>
      <polygon points="137,128 320,96 320,180 137,212" fill="url(#slice-face)" stroke="#7fb0ff" strokeWidth="1.6" />
      <g stroke="rgba(160,195,255,0.5)" strokeWidth="1">
        <line x1="137" y1="128" x2="62" y2="78" strokeDasharray="3 4" />
        <line x1="320" y1="96" x2="245" y2="46" strokeDasharray="3 4" />
      </g>
      <path
        d="M 190 176 C 175 156, 205 138, 230 150 C 258 164, 250 186, 224 188 C 202 190, 194 178, 208 168"
        fill="none"
        stroke="#fff5a4"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="208" cy="168" r="3.4" fill="#fff5a4" />
      <text x="228" y="118" className="guide-svg-label" textAnchor="middle">visible slice</text>
      <text x="228" y="132" className="guide-svg-label guide-svg-label--muted" textAnchor="middle">q1 — p1</text>
      <text x="286" y="66" className="guide-svg-label guide-svg-label--muted" textAnchor="middle">hidden: q2, p2 = 0</text>
      <text x="48" y="196" className="guide-svg-label guide-svg-label--muted">full state: 4D</text>
      <text x="150" y="234" className="guide-svg-label" textAnchor="middle">q1</text>
      <text x="330" y="192" className="guide-svg-label" textAnchor="middle">p1</text>
    </svg>
  )
}

export function InfoPage({ onClose, onLoadPreset }: InfoPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="guide" ref={scrollRef}>
      <header className="guide__topbar">
        <div className="guide__brand">
          <span className="guide__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <strong>Hamilton</strong>
            <span className="guide__brand-sub">field guide</span>
          </div>
        </div>
        <div className="guide__topbar-actions">
          <a className="guide__text-link" href="#try">
            Examples
          </a>
          <button ref={closeRef} type="button" className="guide__button guide__button--primary" onClick={onClose}>
            ← Back to playground
          </button>
        </div>
      </header>

      <section className="guide__hero">
        <div className="guide__hero-copy">
          <p className="guide__eyebrow">Phase space · Hamiltonian · Lagrangian</p>
          <h1>Phase space, without the fog.</h1>
          <p className="guide__lede">
            A physical system is more than a position and a velocity at one instant. It is the whole state — and
            phase space is the stage on which that state moves. Hamiltonians and Lagrangians are two equivalent
            ways of writing the script.
          </p>
          <div className="guide__hero-actions">
            <button type="button" className="guide__button guide__button--primary" onClick={onClose}>
              Open the playground
            </button>
            <a className="guide__button" href="#phase-space">
              Read the guide
            </a>
          </div>
        </div>
        <Figure caption="Harmonic oscillator. Closed orbits circulate around a stable centre; the arrows show the flow.">
          <HarmonicDiagram />
        </Figure>
      </section>

      <div className="guide__layout">
        <nav className="guide__toc" aria-label="Guide contents">
          <span className="guide__toc-title">In this guide</span>
          <a href="#phase-space">01 · Phase space</a>
          <a href="#hamiltonian">02 · Hamiltonians</a>
          <a href="#lagrangian">03 · Lagrangians</a>
          <a href="#reading">04 · Reading the picture</a>
          <a href="#numerics">05 · Numerics</a>
          <a href="#try">06 · Try these</a>
          <a href="#syntax">07 · Expression language</a>
          <a href="#further-reading">08 · Further reading</a>
        </nav>

        <main className="guide__content">
          <section id="phase-space" className="guide-section">
            <p className="guide-section__eyebrow">01 · Phase space</p>
            <h2>A state is a point</h2>
            <p>
              In Hamiltonian mechanics a complete state is a list of positions and conjugate momenta. For one
              particle moving on a line that is a pair <code>(q, p)</code>; for two degrees of freedom it is{' '}
              <code>(q₁, p₁, q₂, p₂)</code>. The space of all such states is <strong>phase space</strong>.
            </p>
            <Formula>
              state = (q₁, …, q<sub>N</sub>, p₁, …, p<sub>N</sub>) ∈ ℝ<sup>2N</sup>
            </Formula>
            <p>
              The equations of motion define a <strong>vector field</strong>: at every point, an arrow tells you how
              the state changes. A solution is a curve that follows those arrows. Conservative systems never
              visit a state twice in a way that crosses another trajectory — deterministic flow does not
              intersect itself.
            </p>
            <div className="guide-grid guide-grid--2">
              <Figure caption="Pendulum. The separatrix divides libration (closed orbits) from rotation. The saddles are the inverted positions.">
                <PendulumDiagram />
              </Figure>
              <div className="guide-card guide-card--soft">
                <h3>Why it is useful</h3>
                <p>
                  A trajectory tells you what one initial condition does. Phase space tells you what{' '}
                  <em>every</em> initial condition does at once: fixed points, stable centres, separatrices,
                  periodic islands and chaotic seas become visible as geometry.
                </p>
                <p>
                  For one degree of freedom the whole phase space is two-dimensional. For two degrees of freedom
                  it is four-dimensional, so this app shows a two-dimensional projection. Use the{' '}
                  <strong>Horizontal</strong> and <strong>Vertical</strong> selectors to choose which pair of
                  coordinates you are looking at.
                </p>
              </div>
            </div>
          </section>

          <section id="hamiltonian" className="guide-section">
            <p className="guide-section__eyebrow">02 · Hamiltonians</p>
            <h2>Energy writes the flow</h2>
            <p>
              A Hamiltonian <code>H(q, p)</code> is the total energy of the system written in terms of positions and
              canonical momenta. Hamilton&apos;s equations turn it into first-order flow:
            </p>
            <Formula>
              q̇<sub>i</sub> = ∂H/∂p<sub>i</sub>
              {'\n'}
              ṗ<sub>i</sub> = −∂H/∂q<sub>i</sub>
            </Formula>
            <p>
              The harmonic oscillator <code>H = ½(p² + q²)</code> gives <code>q̇ = p</code> and <code>ṗ = −q</code>,
              whose orbits are circles. The pendulum <code>H = ½p² + 1 − cos q</code> adds a nonlinear potential and
              produces the separatrix in the diagram above.
            </p>
            <div className="guide-grid guide-grid--2">
              <div className="guide-card">
                <span className="guide-card__tag">Always conserved</span>
                <h3>dH/dt = 0</h3>
                <p>
                  If <code>H</code> has no explicit time dependence, every trajectory stays on a constant-energy
                  level set. For one degree of freedom an orbit lives on a single colour band. For two degrees
                  of freedom the background is an energy slice; the projected orbit moves through the full 4D
                  space, so it can cross bands.
                </p>
              </div>
              <div className="guide-card">
                <span className="guide-card__tag">Canonical pairs</span>
                <h3>q and p are linked</h3>
                <p>
                  The momentum in a Hamiltonian is not always mass times velocity. In a magnetic field, for
                  example, the canonical momentum includes the vector potential. That is why the{' '}
                  <strong>Charged particle</strong> example has a non-obvious phase portrait.
                </p>
              </div>
            </div>
            <div className="guide-callout">
              <strong>In this app:</strong> type an expression for <code>H(q, p)</code>. The derivatives are taken
              symbolically, the background is <code>H</code> sampled on the visible plane, and the arrows are{' '}
              <code>(∂H/∂p, −∂H/∂q)</code>.
            </div>
          </section>

          <section id="lagrangian" className="guide-section">
            <p className="guide-section__eyebrow">03 · Lagrangians</p>
            <h2>Action writes the equations</h2>
            <p>
              A Lagrangian <code>L(q, q̇)</code> is usually kinetic minus potential energy,{' '}
              <code>L = T − V</code>. The physical path is the one that makes the action{' '}
              <code>S = ∫ L dt</code> stationary. Varying the path gives the Euler–Lagrange equations:
            </p>
            <Formula>
              d/dt (∂L/∂q̇<sub>i</sub>) − ∂L/∂q<sub>i</sub> = 0
            </Formula>
            <p>
              These equations are second order in the coordinates. With a velocity-dependent mass matrix{' '}
              <code>M<sub>ij</sub> = ∂²L/∂q̇<sub>i</sub>∂q̇<sub>j</sub></code> and the mixed terms{' '}
              <code>C<sub>ij</sub> = ∂²L/∂q̇<sub>i</sub>∂q<sub>j</sub></code>, the app solves
            </p>
            <Formula>
              M q̈ = b, &nbsp; b<sub>i</sub> = ∂L/∂q<sub>i</sub> − Σ<sub>j</sub> C<sub>ij</sub> q̇<sub>j</sub>
            </Formula>
            <p>
              The <strong>Double pendulum (Lagrangian)</strong> example is there to show a non-diagonal,
              configuration-dependent mass matrix. The <strong>Magnetic field (Lagrangian)</strong> example shows a
              velocity-dependent vector potential.
            </p>
            <div className="guide-grid guide-grid--2">
              <div className="guide-card">
                <span className="guide-card__tag">Legendre transform</span>
                <h3>From L to H</h3>
                <p>
                  The canonical momentum is <code>p<sub>i</sub> = ∂L/∂q̇<sub>i</sub></code>. The Hamiltonian is{' '}
                  <code>H = Σ p<sub>i</sub> q̇<sub>i</sub> − L</code>. For an ordinary mechanical system with{' '}
                  <code>L = T − V</code>, this gives <code>H = T + V</code>.
                </p>
              </div>
              <div className="guide-card">
                <span className="guide-card__tag">In this app</span>
                <h3>Integrated as (q, q̇)</h3>
                <p>
                  Lagrangian trajectories are integrated in coordinates and velocities, and the vertical axis is{' '}
                  <code>q̇</code> (also written <code>v</code>). The energy colour is still{' '}
                  <code>H = p·q̇ − L</code>, so the drift readout and the energy map are meaningful for both
                  formalisms.
                </p>
              </div>
            </div>
            <div className="guide-callout">
              <strong>Same physics, different bookkeeping.</strong> A Hamiltonian is first order in twice as many
              variables; a Lagrangian is second order in the coordinates. The app can integrate either one and
              draws the same kind of phase-space picture.
            </div>
          </section>

          <section id="reading" className="guide-section">
            <p className="guide-section__eyebrow">04 · Reading the picture</p>
            <h2>Four layers, one story</h2>
            <div className="guide-legend">
              <div className="guide-legend__item">
                <span className="guide-legend__swatch guide-legend__swatch--heat" />
                <span>
                  <strong>Energy field</strong> — <code>H</code> on the visible plane. Bands are level sets.
                </span>
              </div>
              <div className="guide-legend__item">
                <span className="guide-legend__arrow">→</span>
                <span>
                  <strong>Vector field</strong> — the direction of the flow, with colour showing relative speed.
                </span>
              </div>
              <div className="guide-legend__item">
                <span className="guide-legend__trail" />
                <span>
                  <strong>Trails</strong> — recent history, fading with age. Colour is the orbit&apos;s initial energy.
                </span>
              </div>
              <div className="guide-legend__item">
                <span className="guide-legend__dot" />
                <span>
                  <strong>Heads</strong> — the current state of each particle. In portrait mode, whole trajectories
                  are drawn instead.
                </span>
              </div>
            </div>
            <div className="guide-grid guide-grid--2">
              <div className="guide-card guide-card--soft">
                <h3>Live flow vs portrait</h3>
                <p>
                  <strong>Live flow</strong> advects a cloud of particles and leaves short comet tails. It is good
                  for watching the motion and the local flow.
                </p>
                <p>
                  <strong>Portrait</strong> seeds a grid of initial conditions, integrates each for a fixed number
                  of steps and draws the resulting curves. It is the global picture: islands, separatrices and
                  chaotic regions reveal themselves without waiting for a single orbit to explore them.
                </p>
              </div>
              <Figure caption="For two degrees of freedom the full state is four-dimensional. The background is a slice; the trajectories still move through the full space.">
                <SliceDiagram />
              </Figure>
            </div>
            <div className="guide-card">
              <h3>What the hidden coordinates do</h3>
              <p>
                When you choose <code>q₁</code> and <code>p₁</code> for a two-degree-of-freedom system, the energy
                background holds <code>q₂ = p₂ = 0</code>. The particles themselves move in all four dimensions,
                so their projection can leave the slice. This is not a bug: it is what a projection of a
                higher-dimensional flow looks like. Change the axes to see another shadow of the same system.
              </p>
            </div>
          </section>

          <section id="numerics" className="guide-section">
            <p className="guide-section__eyebrow">05 · Numerics</p>
            <h2>Following the flow with RK4</h2>
            <p>
              The integrator is a fixed-step fourth-order Runge–Kutta method. It evaluates the vector field four
              times per step and combines the results; the local error is fifth order in the step size. The
              background, the vector field and all particle states are computed in a Web Worker, and the main
              thread only uploads buffers to WebGL2.
            </p>
            <div className="guide-grid guide-grid--3">
              <div className="guide-card">
                <h3>Step size</h3>
                <p>
                  A smaller <code>dt</code> is more accurate but more expensive. Fast, stiff or near-singular
                  systems need smaller steps. Each example starts with a step chosen for its scale.
                </p>
              </div>
              <div className="guide-card">
                <h3>Energy drift</h3>
                <p>
                  The HUD samples a handful of tracer orbits and reports the relative energy change. A number near{' '}
                  <code>0%</code> means the numerical flow is staying on its energy surface.
                </p>
              </div>
              <div className="guide-card">
                <h3>Respawns</h3>
                <p>
                  Particles that leave the visible region or become non-finite are reseeded inside the view. That
                  keeps the animation alive but does not hide a bad step size: if almost everything respawns, lower{' '}
                  <code>dt</code>.
                </p>
              </div>
            </div>
            <div className="guide-callout">
              <strong>Exact derivatives, approximate trajectories.</strong> The partial derivatives in the
              equations of motion are symbolic, not finite differences. The only approximation is the time
              integration itself.
            </div>
          </section>

          <section id="try" className="guide-section">
            <p className="guide-section__eyebrow">06 · Try these</p>
            <h2>Short tours through phase space</h2>
            <p>
              Pick one to load it into the playground. Every example is editable: change a parameter, add a term,
              or switch between the Hamiltonian and Lagrangian versions of the same physics. These eight make a
              good tour; the full playground contains 21 built-in systems.
            </p>
            <div className="guide-preset-grid">
              {TRY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="guide-preset"
                  onClick={() => onLoadPreset(preset)}
                >
                  <span className="guide-preset__meta">
                    {preset.kind === 'hamiltonian' ? 'Hamiltonian' : 'Lagrangian'} · {preset.dof}D
                  </span>
                  <span className="guide-preset__name">{preset.name}</span>
                  <span className="guide-preset__desc">{preset.description}</span>
                  <span className="guide-preset__action">Open in playground →</span>
                </button>
              ))}
            </div>
          </section>

          <section id="syntax" className="guide-section">
            <p className="guide-section__eyebrow">07 · Expression language</p>
            <h2>Writing a system</h2>
            <p>
              Use <code>*</code> for multiplication, <code>^</code> or <code>**</code> for powers, and parentheses
              to group. Any name that is not a coordinate or a built-in constant becomes an editable parameter.
            </p>
            <div className="guide-table-wrap">
              <table className="guide-table">
                <thead>
                  <tr>
                    <th>System</th>
                    <th>1 DOF</th>
                    <th>2 DOF</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Hamiltonian</td>
                    <td>
                      <code>q, p</code>
                    </td>
                    <td>
                      <code>q1, p1, q2, p2</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Lagrangian</td>
                    <td>
                      <code>q, v</code> or <code>qdot</code>
                    </td>
                    <td>
                      <code>q1, v1, q2, v2</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Operators</td>
                    <td colSpan={2}>
                      <code>+ − * / ^</code> (or <code>**</code>)
                    </td>
                  </tr>
                  <tr>
                    <td>Functions</td>
                    <td colSpan={2}>
                      <code>sin cos tan asin acos atan sinh cosh tanh exp log ln log10 sqrt abs sign pow atan2</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Constants</td>
                    <td colSpan={2}>
                      <code>pi, π, e, tau</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code>min</code> and <code>max</code> are available for evaluation, but they are not differentiable;
              using them in a system expression will produce a clear error. Everything else in the table is
              differentiated symbolically.
            </p>
            <div className="guide-callout">
              <strong>Examples.</strong> <code>p^2/2 + q^4/4</code>, <code>p^2/2 + a*(1 - cos(q))</code>,{' '}
              <code>v^2/2 - q^2/2</code>. Try changing <code>a</code> while the animation is running.
            </div>
          </section>

          <section id="further-reading" className="guide-section">
            <p className="guide-section__eyebrow">08 · Further reading</p>
            <h2>Go deeper</h2>
            <div className="guide-links">
              <a href="https://en.wikipedia.org/wiki/Phase_space" target="_blank" rel="noreferrer">
                Phase space
              </a>
              <a href="https://en.wikipedia.org/wiki/Hamiltonian_mechanics" target="_blank" rel="noreferrer">
                Hamiltonian mechanics
              </a>
              <a href="https://en.wikipedia.org/wiki/Lagrangian_mechanics" target="_blank" rel="noreferrer">
                Lagrangian mechanics
              </a>
              <a href="https://en.wikipedia.org/wiki/Euler%E2%80%93Lagrange_equation" target="_blank" rel="noreferrer">
                Euler–Lagrange equation
              </a>
              <a href="https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods" target="_blank" rel="noreferrer">
                Runge–Kutta methods
              </a>
              <a href="https://en.wikipedia.org/wiki/H%C3%A9non%E2%80%93Heiles_system" target="_blank" rel="noreferrer">
                Hénon–Heiles system
              </a>
              <a href="https://en.wikipedia.org/wiki/Double_pendulum" target="_blank" rel="noreferrer">
                Double pendulum
              </a>
            </div>
          </section>
        </main>
      </div>

      <footer className="guide__footer">
        <div>
          <strong>Hamilton</strong> — a phase-space playground built with React, TypeScript, WebGL2 and a Web
          Worker integrator.
        </div>
        <button type="button" className="guide__button guide__button--primary" onClick={onClose}>
          ← Back to playground
        </button>
      </footer>
    </div>
  )
}
