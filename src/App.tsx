import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { InfoPage } from './components/InfoPage'
import { PhaseCanvas } from './components/PhaseCanvas'
import { ExprError } from './core/expr'
import { PRESETS, type Preset } from './core/presets'
import { axisOptions, freeVariables, makeAxes } from './core/system'
import type { AxisSpec, Dof, Kind, SimStats, SystemConfig, ViewRect } from './core/types'
import './App.css'

const INITIAL_PRESET = PRESETS[0]
const HAMILTONIAN_PRESETS = PRESETS.filter((preset) => preset.kind === 'hamiltonian')
const LAGRANGIAN_PRESETS = PRESETS.filter((preset) => preset.kind === 'lagrangian')

function formatExpressionError(source: string, error: unknown): string {
  if (error instanceof ExprError) {
    const before = source.slice(0, error.pos)
    const lines = before.split('\n')
    return `${error.message} · line ${lines.length}, column ${lines[lines.length - 1].length + 1}`
  }
  return error instanceof Error ? error.message : String(error)
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const percent = value * 100
  if (percent !== 0 && Math.abs(percent) < 1e-4) {
    return `${percent > 0 ? '+' : ''}${percent.toExponential(1)}%`
  }
  return `${percent > 0 ? '+' : ''}${percent.toFixed(3)}%`
}

function formatRange(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1000 || (magnitude > 0 && magnitude < 0.01)) return value.toExponential(1)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function driftClass(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude < 1e-4) return 'is-good'
  if (magnitude < 1e-2) return 'is-ok'
  return 'is-warn'
}

function coordinateHint(kind: Kind, dof: Dof): string {
  if (kind === 'hamiltonian') {
    return dof === 1
      ? 'Coordinates: q, p (canonical). Any other name becomes a parameter.'
      : 'Coordinates: q1, p1, q2, p2. Any other name becomes a parameter.'
  }
  return dof === 1
    ? 'Coordinates: q, v (or qdot). Any other name becomes a parameter.'
    : 'Coordinates: q1, v1, q2, v2. Any other name becomes a parameter.'
}

interface RangeControlProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
  disabled?: boolean
}

function RangeControl({ label, value, min, max, step, display, onChange, disabled }: RangeControlProps) {
  return (
    <label className="range-control">
      <span className="range-control__head">
        <span>{label}</span>
        <output>{display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      <span>{label}</span>
    </label>
  )
}

interface PresetCardProps {
  preset: Preset
  active: boolean
  onSelect: (preset: Preset) => void
}

function PresetCard({ preset, active, onSelect }: PresetCardProps) {
  return (
    <button
      type="button"
      className={`preset-card${active ? ' is-active' : ''}`}
      onClick={() => onSelect(preset)}
      title={preset.description}
    >
      <span className="preset-card__top">
        <span className="preset-card__name">{preset.name}</span>
        <span className="preset-card__tag">{preset.dof}D</span>
      </span>
      <span className="preset-card__desc">{preset.description}</span>
    </button>
  )
}

export default function App() {
  const [presetId, setPresetId] = useState<string | null>(INITIAL_PRESET.id)
  const [kind, setKind] = useState<Kind>(INITIAL_PRESET.kind)
  const [dof, setDof] = useState<Dof>(INITIAL_PRESET.dof)
  const [expression, setExpression] = useState(INITIAL_PRESET.expression)
  const [paramValues, setParamValues] = useState<Record<string, number>>({ ...INITIAL_PRESET.params })
  const [lastFreeKey, setLastFreeKey] = useState('')
  const [paramBounds, setParamBounds] = useState<Record<string, [number, number]>>({
    ...(INITIAL_PRESET.paramBounds ?? {}),
  })
  const [axisX, setAxisX] = useState(0)
  const [axisY, setAxisY] = useState(1)
  const [view, setView] = useState<ViewRect>(INITIAL_PRESET.view)
  const [suggestedView, setSuggestedView] = useState<ViewRect>(INITIAL_PRESET.view)

  const [mode, setMode] = useState<'live' | 'portrait'>('live')
  const [playing, setPlaying] = useState(true)
  const [dt, setDt] = useState(INITIAL_PRESET.dt)
  const [speed, setSpeed] = useState(INITIAL_PRESET.speed)
  const [particleCount, setParticleCount] = useState(1200)
  const [portraitSteps, setPortraitSteps] = useState(760)
  const [portraitSeeds, setPortraitSeeds] = useState(520)
  const [showField, setShowField] = useState(true)
  const [showArrows, setShowArrows] = useState(true)
  const [showTrails, setShowTrails] = useState(true)
  const [runNonce, setRunNonce] = useState(0)

  const [simError, setSimError] = useState<string | null>(null)
  const [simStats, setSimStats] = useState<SimStats | null>(null)
  const [portraitProgress, setPortraitProgress] = useState<number | null>(null)
  const [portraitInfo, setPortraitInfo] = useState<{ seedCount: number; segments: number } | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  const expressionInfo = useMemo(() => {
    try {
      const free = freeVariables(expression, kind, dof)
      return { free, freeKey: free.join('|'), ok: true, error: null as string | null }
    } catch (error) {
      return { free: [] as string[], freeKey: '', ok: false, error: formatExpressionError(expression, error) }
    }
  }, [expression, kind, dof])

  // Keep one editable value per free variable.  Adjusting state during render
  // is the React-recommended alternative to an effect for derived state.
  if (expressionInfo.ok && expressionInfo.freeKey !== lastFreeKey) {
    setLastFreeKey(expressionInfo.freeKey)
    setParamValues((previous) => {
      let changed = false
      const next: Record<string, number> = {}
      for (const name of expressionInfo.free) {
        const value = previous[name]
        next[name] = typeof value === 'number' && Number.isFinite(value) ? value : 1
        if (next[name] !== value) changed = true
      }
      if (Object.keys(previous).length !== expressionInfo.free.length) changed = true
      return changed ? next : previous
    })
  }

  const effectiveParams = useMemo(() => {
    if (!expressionInfo.ok) return paramValues
    const params: Record<string, number> = {}
    for (const name of expressionInfo.free) {
      const value = paramValues[name]
      params[name] = typeof value === 'number' && Number.isFinite(value) ? value : 1
    }
    return params
  }, [expressionInfo.ok, expressionInfo.free, paramValues])

  const config: SystemConfig = useMemo(
    () => ({ kind, dof, expression, params: effectiveParams }),
    [kind, dof, expression, effectiveParams],
  )

  const axes: AxisSpec = useMemo(() => makeAxes(kind, dof, axisX, axisY), [kind, dof, axisX, axisY])
  const options = useMemo(() => axisOptions(kind, dof), [kind, dof])

  const handleViewChange = useCallback((next: ViewRect) => setView(next), [])
  const openInfo = useCallback(() => setShowInfo(true), [])
  const closeInfo = useCallback(() => setShowInfo(false), [])

  const loadPreset = useCallback((preset: Preset) => {
    setPresetId(preset.id)
    setKind(preset.kind)
    setDof(preset.dof)
    setExpression(preset.expression)
    setParamValues({ ...preset.params })
    setParamBounds({ ...(preset.paramBounds ?? {}) })
    setAxisX(0)
    setAxisY(1)
    setView(preset.view)
    setSuggestedView(preset.view)
    setDt(preset.dt)
    setSpeed(preset.speed)
    setMode('live')
    setPlaying(true)
    setSimError(null)
    setSimStats(null)
    setPortraitInfo(null)
    setPortraitProgress(null)
    setRunNonce((value) => value + 1)
  }, [])

  const loadPresetFromGuide = useCallback(
    (preset: Preset) => {
      loadPreset(preset)
      closeInfo()
    },
    [loadPreset, closeInfo],
  )

  const resetSimulation = useCallback(() => {
    setView(suggestedView)
    setRunNonce((value) => value + 1)
    setSimError(null)
    setSimStats(null)
    if (mode === 'live') setPlaying(true)
  }, [suggestedView, mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showInfo) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.code === 'Space' && mode === 'live') {
        event.preventDefault()
        setPlaying((value) => !value)
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        resetSimulation()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, resetSimulation, showInfo])

  const changeKind = (next: Kind) => {
    if (next === kind) return
    setKind(next)
    setPresetId(null)
    setAxisX(0)
    setAxisY(1)
    setSimError(null)
  }

  const changeDof = (next: Dof) => {
    if (next === dof) return
    setDof(next)
    setPresetId(null)
    setAxisX(0)
    setAxisY(1)
    setSimError(null)
  }

  const changeExpression = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setExpression(event.target.value)
    setPresetId(null)
    setSimError(null)
  }

  const changeParam = (name: string, value: number) => {
    if (!Number.isFinite(value)) return
    setParamValues((previous) => ({ ...previous, [name]: value }))
  }

  const changeAxisX = (index: number) => {
    setAxisX(index)
    if (index === axes.yIndex) {
      const alternative = options.find((option) => option.index !== index)
      if (alternative) setAxisY(alternative.index)
    }
  }

  const changeAxisY = (index: number) => {
    setAxisY(index)
    if (index === axes.xIndex) {
      const alternative = options.find((option) => option.index !== index)
      if (alternative) setAxisX(alternative.index)
    }
  }

  const visibleError = expressionInfo.error ?? simError
  const isLive = mode === 'live'
  const progressPercent = portraitProgress === null ? 0 : Math.round(portraitProgress * 100)

  if (showInfo) {
    return <InfoPage onClose={closeInfo} onLoadPreset={loadPresetFromGuide} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand__text">
            <h1>Hamilton</h1>
            <p>phase space playground</p>
          </div>
        </div>

        <div className="topbar__actions">
          <div className="segmented segmented--mode" role="group" aria-label="Visualisation mode">
            <button
              type="button"
              className={isLive ? 'is-active' : ''}
              onClick={() => setMode('live')}
              aria-pressed={isLive}
            >
              Live flow
            </button>
            <button
              type="button"
              className={!isLive ? 'is-active' : ''}
              onClick={() => setMode('portrait')}
              aria-pressed={!isLive}
            >
              Portrait
            </button>
          </div>
          <button
            type="button"
            className="button button--guide"
            onClick={openInfo}
            title="Field guide"
            aria-label="Guide"
          >
            <span className="button__glyph" aria-hidden="true">
              ?
            </span>
            <span className="button__label">Guide</span>
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setPlaying((value) => !value)}
            disabled={!isLive}
            title="Play / pause (space)"
          >
            <span className="button__glyph" aria-hidden="true">
              {isLive && playing ? '❚❚' : '▶'}
            </span>
            {isLive && playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="button" onClick={resetSimulation} title="Reset view and trajectories (R)">
            <span className="button__glyph" aria-hidden="true">
              ⟲
            </span>
            Reset
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar__scroll">
            <section className="panel">
              <div className="panel__head">
                <h2>Examples</h2>
                <span className="panel__meta">{PRESETS.length} systems</span>
              </div>
              <h3 className="panel__subhead">Hamiltonian</h3>
              <div className="preset-list">
                {HAMILTONIAN_PRESETS.map((preset) => (
                  <PresetCard key={preset.id} preset={preset} active={presetId === preset.id} onSelect={loadPreset} />
                ))}
              </div>
              <h3 className="panel__subhead">Lagrangian</h3>
              <div className="preset-list">
                {LAGRANGIAN_PRESETS.map((preset) => (
                  <PresetCard key={preset.id} preset={preset} active={presetId === preset.id} onSelect={loadPreset} />
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>System</h2>
                <span className="panel__meta">{dof} DOF</span>
              </div>
              <div className="segmented segmented--full" role="group" aria-label="System kind">
                <button
                  type="button"
                  className={kind === 'hamiltonian' ? 'is-active' : ''}
                  onClick={() => changeKind('hamiltonian')}
                  aria-pressed={kind === 'hamiltonian'}
                >
                  Hamiltonian
                </button>
                <button
                  type="button"
                  className={kind === 'lagrangian' ? 'is-active' : ''}
                  onClick={() => changeKind('lagrangian')}
                  aria-pressed={kind === 'lagrangian'}
                >
                  Lagrangian
                </button>
              </div>
              <div className="segmented segmented--full" role="group" aria-label="Degrees of freedom">
                <button
                  type="button"
                  className={dof === 1 ? 'is-active' : ''}
                  onClick={() => changeDof(1)}
                  aria-pressed={dof === 1}
                >
                  1 DOF
                </button>
                <button
                  type="button"
                  className={dof === 2 ? 'is-active' : ''}
                  onClick={() => changeDof(2)}
                  aria-pressed={dof === 2}
                >
                  2 DOF
                </button>
              </div>
              <label className="field-label" htmlFor="system-expression">
                {kind === 'hamiltonian' ? 'H(q, p) =' : 'L(q, q̇) ='}
              </label>
              <textarea
                id="system-expression"
                className="expression"
                value={expression}
                onChange={changeExpression}
                spellCheck={false}
                rows={3}
                autoCapitalize="off"
                autoComplete="off"
              />
              <p className="hint">{coordinateHint(kind, dof)}</p>
              <p className="hint hint--faint">
                + − × ÷ ^ · sin cos tan exp log sqrt abs · constants pi, e
              </p>
              {visibleError && <div className="error-box">{visibleError}</div>}
              {expressionInfo.ok && expressionInfo.free.length > 0 && (
                <div className="params">
                  <div className="params__title">Parameters</div>
                  {expressionInfo.free.map((name) => {
                    const bounds = paramBounds[name]
                    const value = paramValues[name] ?? 1
                    return (
                      <div className="param" key={name}>
                        <div className="param__head">
                          <span className="param__name">{name}</span>
                          <input
                            className="param__value"
                            type="number"
                            value={Number.isFinite(value) ? value : 1}
                            step={bounds ? (bounds[1] - bounds[0]) / 200 : 0.01}
                            onChange={(event) => changeParam(name, event.currentTarget.valueAsNumber)}
                          />
                        </div>
                        {bounds && (
                          <input
                            type="range"
                            min={bounds[0]}
                            max={bounds[1]}
                            step={(bounds[1] - bounds[0]) / 200}
                            value={value}
                            onChange={(event) => changeParam(name, Number(event.target.value))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>Motion</h2>
                <span className="panel__meta">RK4</span>
              </div>
              <RangeControl
                label="Integration step"
                value={dt}
                min={0.001}
                max={0.03}
                step={0.001}
                display={dt.toFixed(3)}
                onChange={setDt}
              />
              <RangeControl
                label="Simulation speed"
                value={speed}
                min={0.1}
                max={4}
                step={0.1}
                display={`${speed.toFixed(1)}×`}
                onChange={setSpeed}
                disabled={!isLive}
              />
              <RangeControl
                label="Particles"
                value={particleCount}
                min={400}
                max={4000}
                step={100}
                display={`${particleCount}`}
                onChange={setParticleCount}
                disabled={!isLive}
              />
              <p className="hint hint--faint">
                Fixed-step Runge–Kutta 4. Smaller steps trade speed for accuracy and stability.
              </p>
            </section>

            {!isLive && (
              <section className="panel">
                <div className="panel__head">
                  <h2>Portrait</h2>
                  <span className="panel__meta">static</span>
                </div>
                <RangeControl
                  label="Integration steps"
                  value={portraitSteps}
                  min={200}
                  max={2000}
                  step={50}
                  display={`${portraitSteps}`}
                  onChange={setPortraitSteps}
                />
                <RangeControl
                  label="Starting points"
                  value={portraitSeeds}
                  min={100}
                  max={2000}
                  step={20}
                  display={`${portraitSeeds}`}
                  onChange={setPortraitSeeds}
                />
                <div className="portrait-progress">
                  <span>{portraitProgress === null ? 'Ready' : `Integrating ${progressPercent}%`}</span>
                  <div className="portrait-progress__track">
                    <div className="portrait-progress__fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  {portraitInfo && (
                    <span className="hint hint--faint">
                      {portraitInfo.seedCount} seeds × {portraitInfo.segments} steps
                    </span>
                  )}
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel__head">
                <h2>View</h2>
                <button type="button" className="link-button" onClick={() => setView(suggestedView)}>
                  reset view
                </button>
              </div>
              <label className="select-row">
                <span>Horizontal</span>
                <select value={axes.xIndex} onChange={(event) => changeAxisX(Number(event.target.value))}>
                  {options.map((option) => (
                    <option key={option.index} value={option.index} disabled={option.index === axes.yIndex}>
                      {option.label} — {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-row">
                <span>Vertical</span>
                <select value={axes.yIndex} onChange={(event) => changeAxisY(Number(event.target.value))}>
                  {options.map((option) => (
                    <option key={option.index} value={option.index} disabled={option.index === axes.xIndex}>
                      {option.label} — {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint hint--faint">
                Drag the canvas to pan, scroll to zoom. Energy slices hold the coordinates that are not shown at
                zero.
              </p>
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>Display</h2>
              </div>
              <div className="toggles">
                <Toggle label="Energy field" checked={showField} onChange={setShowField} />
                <Toggle label="Vector field" checked={showArrows} onChange={setShowArrows} disabled={!isLive} />
                <Toggle label="Trails" checked={showTrails} onChange={setShowTrails} disabled={!isLive} />
              </div>
              <div className="legend">
                <span className="legend__label">low</span>
                <span className="legend__bar" />
                <span className="legend__label">high</span>
              </div>
              <p className="hint hint--faint">Colour encodes the total energy of each orbit or background point.</p>
            </section>

            <button type="button" className="sidebar-guide" onClick={openInfo}>
              <span className="sidebar-guide__eyebrow">New to phase space?</span>
              <span className="sidebar-guide__title">
                Open the field guide <span aria-hidden="true">→</span>
              </span>
              <span className="sidebar-guide__desc">
                Hamiltonians, Lagrangians, separatrices, chaos and how to read the plot.
              </span>
            </button>

            <footer className="sidebar__footer">
              <span className="dot" /> WebGL2 renderer
              <span className="dot" /> Web Worker integrator
              <span className="dot" /> symbolic derivatives
            </footer>
          </div>
        </aside>

        <main className="stage">
          <PhaseCanvas
            config={config}
            axes={axes}
            view={view}
            onViewChange={handleViewChange}
            mode={mode}
            playing={playing}
            dt={dt}
            speed={speed}
            particleCount={particleCount}
            portraitSteps={portraitSteps}
            portraitSeeds={portraitSeeds}
            showField={showField}
            showArrows={showArrows}
            showTrails={showTrails}
            runNonce={runNonce}
            onError={setSimError}
            onStats={setSimStats}
            onPortraitProgress={setPortraitProgress}
            onPortraitInfo={setPortraitInfo}
          />

          <div className="hud hud--top-left">
            <span className={`chip ${isLive ? 'chip--live' : 'chip--portrait'}`}>
              {isLive ? (playing ? 'LIVE' : 'PAUSED') : 'PHASE PORTRAIT'}
            </span>
            {isLive && simStats && (
              <>
                <span className="readout">
                  <span className="readout__label">t</span>
                  {simStats.time.toFixed(2)}
                </span>
                <span className={`readout ${driftClass(simStats.drift)}`}>
                  <span className="readout__label">E drift</span>
                  {formatPercent(simStats.drift)}
                </span>
                <span className="readout">
                  <span className="readout__label">particles</span>
                  {simStats.particles}
                </span>
              </>
            )}
            {!isLive && portraitInfo && (
              <>
                <span className="readout">
                  <span className="readout__label">seeds</span>
                  {portraitInfo.seedCount}
                </span>
                <span className="readout">
                  <span className="readout__label">segments</span>
                  {portraitInfo.segments}
                </span>
              </>
            )}
          </div>

          <div className="hud hud--top-right">
            <span className="chip">{kind === 'hamiltonian' ? 'HAMILTONIAN' : 'LAGRANGIAN'}</span>
            <span className="range-label">
              {axes.xLabel} ∈ [{formatRange(view.xMin)}, {formatRange(view.xMax)}]
            </span>
            <span className="range-label">
              {axes.yLabel} ∈ [{formatRange(view.yMin)}, {formatRange(view.yMax)}]
            </span>
          </div>

          {visibleError && <div className="stage-error">{visibleError}</div>}

          {!isLive && portraitProgress !== null && (
            <div className="progress-panel">
              <div className="progress-panel__title">Integrating portrait</div>
              <div className="progress-panel__track">
                <div className="progress-panel__fill" style={{ width: `${Math.max(2, progressPercent)}%` }} />
              </div>
              <div className="progress-panel__number">{progressPercent}%</div>
            </div>
          )}

          <div className="hud hud--bottom-left">
            <span className="hintbar">
              {isLive
                ? `${particleCount} particles · dt ${dt.toFixed(3)} · speed ${speed.toFixed(1)}×`
                : `${portraitSeeds} starting points · dt ${dt.toFixed(3)}`}
            </span>
          </div>
          <div className="hud hud--bottom-right">
            <span className="hintbar">
              {isLive
                ? 'drag to pan · scroll to zoom · space to play/pause'
                : 'drag to pan · scroll to zoom · portrait re-seeds automatically'}
            </span>
          </div>
        </main>
      </div>
    </div>
  )
}
