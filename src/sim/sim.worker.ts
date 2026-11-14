/// <reference lib="webworker" />
import { compileSystem, type CompiledSystem } from '../core/system'
import { makeRk4Workspace, rk4Step } from '../core/integrator'
import type { AxisSpec, Dof, Kind, LiveSettings, SystemConfig, ViewRect } from '../core/types'
import type {
  FieldResponse,
  LiveSnapshotResponse,
  PortraitResponse,
  WorkerRequest,
  WorkerResponse,
} from './messages'

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const ctx = self as unknown as WorkerScope

const MAX_FIELD_RESOLUTION = 384
const MAX_PARTICLES = 6000
const MAX_PORTRAIT_SEGMENTS = 900_000
const TRAIL_TRACERS = 24

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function robustRange(values: ArrayLike<number>, lowPercentile = 0.02, highPercentile = 0.98): [number, number] {
  const finite: number[] = []
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (Number.isFinite(value)) finite.push(value)
  }
  if (finite.length === 0) return [0, 1]
  finite.sort((a, b) => a - b)
  const low = finite[Math.floor(lowPercentile * (finite.length - 1))]
  const high = finite[Math.floor(highPercentile * (finite.length - 1))]
  if (!(high > low)) {
    const pad = Math.abs(low) * 0.05 + 0.5
    return [low - pad, low + pad]
  }
  return [low, high]
}

function normalize(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 0
  if (!(high > low)) return 0.5
  return clamp((value - low) / (high - low), 0, 1)
}

// ---------------------------------------------------------------------------
// Compilation cache
// ---------------------------------------------------------------------------

let cachedKey = ''
let cachedSystem: CompiledSystem | null = null

function systemKey(config: SystemConfig): string {
  return JSON.stringify([
    config.kind,
    config.dof,
    config.expression,
    Object.entries(config.params).sort(([a], [b]) => a.localeCompare(b)),
  ])
}

function getSystem(config: SystemConfig): CompiledSystem {
  const key = systemKey(config)
  if (cachedSystem && cachedKey === key) return cachedSystem
  const compiled = compileSystem(config)
  cachedKey = key
  cachedSystem = compiled
  return compiled
}

// ---------------------------------------------------------------------------
// Energy background + vector field
// ---------------------------------------------------------------------------

function setStateAtPoint(
  state: Float64Array,
  axes: AxisSpec,
  x: number,
  y: number,
): void {
  state.fill(0)
  state[axes.xIndex] = x
  if (axes.yIndex !== axes.xIndex) state[axes.yIndex] = y
}

function computeField(
  system: CompiledSystem,
  view: ViewRect,
  axes: AxisSpec,
  resolution: number,
  arrowResolution: number,
): Omit<FieldResponse, 'type' | 'requestId'> {
  const width = Math.round(clamp(resolution, 32, MAX_FIELD_RESOLUTION))
  const height = width
  const values = new Float64Array(width * height)
  const state = new Float64Array(system.dim)
  const xRange = Math.max(1e-9, view.xMax - view.xMin)
  const yRange = Math.max(1e-9, view.yMax - view.yMin)

  for (let row = 0; row < height; row += 1) {
    const y = view.yMin + ((row + 0.5) / height) * yRange
    for (let column = 0; column < width; column += 1) {
      const x = view.xMin + ((column + 0.5) / width) * xRange
      setStateAtPoint(state, axes, x, y)
      let value: number
      try {
        value = system.energy(state)
      } catch {
        value = Number.NaN
      }
      values[row * width + column] = value
    }
  }

  const [eMin, eMax] = robustRange(values)
  const energy = new Uint8Array(width * height)
  for (let i = 0; i < values.length; i += 1) {
    energy[i] = Math.round(normalize(values[i], eMin, eMax) * 255)
  }

  // Vector field: a regular lattice of short arrows in the projected plane.
  const aspect = xRange / yRange
  const cols = Math.round(clamp(arrowResolution, 6, 40))
  const rows = Math.round(clamp(cols / aspect, 6, 40))
  const cellWidth = xRange / cols
  const cellHeight = yRange / rows
  const arrowLength = 0.38 * Math.min(cellWidth, cellHeight)
  const barbLength = 0.34 * arrowLength
  const derivative = new Float64Array(system.dim)
  const arrows: number[] = []
  const magnitudes: number[] = []
  const points: { x: number; y: number; dx: number; dy: number; magnitude: number }[] = []

  for (let row = 0; row < rows; row += 1) {
    const y = view.yMin + ((row + 0.5) / rows) * yRange
    for (let column = 0; column < cols; column += 1) {
      const x = view.xMin + ((column + 0.5) / cols) * xRange
      setStateAtPoint(state, axes, x, y)
      try {
        system.deriv(state, derivative)
      } catch {
        continue
      }
      const dx = derivative[axes.xIndex]
      const dy = derivative[axes.yIndex]
      const magnitude = Math.hypot(dx, dy)
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || magnitude < 1e-12) continue
      points.push({ x, y, dx, dy, magnitude })
      magnitudes.push(magnitude)
    }
  }

  magnitudes.sort((a, b) => a - b)
  const reference = magnitudes.length > 0 ? magnitudes[Math.floor(0.95 * (magnitudes.length - 1))] : 0
  const logReference = Math.log1p(reference)

  for (const point of points) {
    const { x, y, dx, dy, magnitude } = point
    const ux = dx / magnitude
    const uy = dy / magnitude
    const tipX = x + ux * arrowLength
    const tipY = y + uy * arrowLength
    const t = logReference > 1e-9 ? clamp(Math.log1p(magnitude) / logReference, 0, 1) : 0.5
    const color = 0.22 + 0.7 * t
    const angle = Math.atan2(uy, ux)
    const barb1X = tipX + Math.cos(angle + Math.PI - 0.5) * barbLength
    const barb1Y = tipY + Math.sin(angle + Math.PI - 0.5) * barbLength
    const barb2X = tipX + Math.cos(angle + Math.PI + 0.5) * barbLength
    const barb2Y = tipY + Math.sin(angle + Math.PI + 0.5) * barbLength

    arrows.push(x, y, color, tipX, tipY, color)
    arrows.push(tipX, tipY, color, barb1X, barb1Y, color)
    arrows.push(tipX, tipY, color, barb2X, barb2Y, color)
  }

  return {
    width,
    height,
    energy,
    eMin,
    eMax,
    arrows: new Float32Array(arrows),
  }
}

// ---------------------------------------------------------------------------
// Live cloud
// ---------------------------------------------------------------------------

interface LiveState {
  system: CompiledSystem
  axes: AxisSpec
  view: ViewRect
  settings: LiveSettings
  count: number
  states: Float64Array
  work: ReturnType<typeof makeRk4Workspace>
  respawned: Uint8Array
  positions: Float32Array
  time: number
  totalSteps: number
  snapshotCount: number
  lastWall: number
  timer: number | null
  paused: boolean
  tracers: number[]
  tracerEnergy: number[]
  energyScratch: Float64Array
  drift: number
  driftSpread: number
}

let live: LiveState | null = null
let portraitGeneration = 0

function stopLive(): void {
  if (live && live.timer !== null) clearTimeout(live.timer)
  live = null
}

function seedStateAt(
  states: Float64Array,
  offset: number,
  dim: number,
  axes: AxisSpec,
  x: number,
  y: number,
): void {
  for (let i = 0; i < dim; i += 1) states[offset + i] = 0
  states[offset + axes.xIndex] = x
  if (axes.yIndex !== axes.xIndex) states[offset + axes.yIndex] = y
}

function respawnParticle(
  state: LiveState,
  particle: number,
  randomize: boolean,
): void {
  const xRange = Math.max(1e-9, state.view.xMax - state.view.xMin)
  const yRange = Math.max(1e-9, state.view.yMax - state.view.yMin)
  let x = state.view.xMin + 0.5 * xRange
  let y = state.view.yMin + 0.5 * yRange
  if (randomize) {
    x = state.view.xMin + Math.random() * xRange
    y = state.view.yMin + Math.random() * yRange
  }
  seedStateAt(state.states, particle * state.system.dim, state.system.dim, state.axes, x, y)
  state.respawned[particle] = 1
  const tracerIndex = state.tracers.indexOf(particle)
  if (tracerIndex >= 0) {
    const offset = particle * state.system.dim
    for (let i = 0; i < state.system.dim; i += 1) state.energyScratch[i] = state.states[offset + i]
    state.tracerEnergy[tracerIndex] = state.system.energy(state.energyScratch)
  }
}

function startLive(
  config: SystemConfig,
  view: ViewRect,
  axes: AxisSpec,
  settings: LiveSettings,
  paused: boolean,
): void {
  stopLive()
  portraitGeneration += 1

  let system: CompiledSystem
  try {
    system = getSystem(config)
  } catch (error) {
    ctx.postMessage({ type: 'live-error', message: errorMessage(error) })
    return
  }

  const count = Math.round(clamp(settings.count, 80, MAX_PARTICLES))
  const dt = clamp(settings.dt, 1e-5, 0.1)
  const speed = clamp(settings.speed, 0.01, 10)
  const xRange = Math.max(1e-9, view.xMax - view.xMin)
  const yRange = Math.max(1e-9, view.yMax - view.yMin)
  const cols = Math.round(clamp(Math.sqrt((count * xRange) / yRange), 2, count))
  const rows = Math.ceil(count / cols)
  const states = new Float64Array(count * system.dim)
  const energies = new Float64Array(count)
  const state = new Float64Array(system.dim)

  for (let particle = 0; particle < count; particle += 1) {
    const column = particle % cols
    const row = Math.floor(particle / cols)
    const jitterX = (Math.random() - 0.5) * 0.55
    const jitterY = (Math.random() - 0.5) * 0.55
    const x = view.xMin + ((column + 0.5 + jitterX) / cols) * xRange
    const y = view.yMin + ((row + 0.5 + jitterY) / rows) * yRange
    seedStateAt(states, particle * system.dim, system.dim, axes, x, y)
    const offset = particle * system.dim
    for (let i = 0; i < system.dim; i += 1) state[i] = states[offset + i]
    energies[particle] = system.energy(state)
  }

  const [eLow, eHigh] = robustRange(energies)
  const colors = new Float32Array(count)
  for (let particle = 0; particle < count; particle += 1) {
    colors[particle] = normalize(energies[particle], eLow, eHigh)
  }

  const tracerCount = Math.min(TRAIL_TRACERS, count)
  const tracers: number[] = []
  const tracerEnergy: number[] = []
  for (let i = 0; i < tracerCount; i += 1) {
    const particle = Math.floor(((i + 0.5) / tracerCount) * count)
    tracers.push(particle)
    const offset = particle * system.dim
    for (let j = 0; j < system.dim; j += 1) state[j] = states[offset + j]
    tracerEnergy.push(system.energy(state))
  }

  live = {
    system,
    axes,
    view,
    settings: { dt, speed, count },
    count,
    states,
    work: makeRk4Workspace(system.dim),
    respawned: new Uint8Array(count),
    positions: new Float32Array(count * 2),
    time: 0,
    totalSteps: 0,
    snapshotCount: 0,
    lastWall: performance.now(),
    timer: null,
    paused,
    tracers,
    tracerEnergy,
    energyScratch: new Float64Array(system.dim),
    drift: 0,
    driftSpread: 0,
  }

  ctx.postMessage(
    {
      type: 'live-seeded',
      count,
      colors,
      dim: system.dim,
      kind: config.kind as Kind,
      dof: config.dof as Dof,
    },
    [colors.buffer],
  )

  if (paused) {
    // Show the freshly seeded cloud even while the simulation is frozen.
    for (let particle = 0; particle < count; particle += 1) {
      const offset = particle * system.dim
      live.positions[2 * particle] = states[offset + axes.xIndex]
      live.positions[2 * particle + 1] = states[offset + axes.yIndex]
    }
    live.snapshotCount = 1
    ctx.postMessage(
      {
        type: 'live-snapshot',
        positions: live.positions,
        respawned: live.respawned,
        time: 0,
        drift: 0,
        driftSpread: 0,
        steps: 0,
      },
      [live.positions.buffer, live.respawned.buffer],
    )
    live.positions = new Float32Array(count * 2)
    live.respawned = new Uint8Array(count)
  } else {
    scheduleTick()
  }
}

function sampleEnergyDrift(state: LiveState): void {
  if (state.tracers.length === 0) return
  const dim = state.system.dim
  const scratch = new Float64Array(dim)
  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let i = 0; i < state.tracers.length; i += 1) {
    const offset = state.tracers[i] * dim
    for (let j = 0; j < dim; j += 1) scratch[j] = state.states[offset + j]
    const energy = state.system.energy(scratch)
    const initial = state.tracerEnergy[i]
    if (!Number.isFinite(energy) || !Number.isFinite(initial)) continue
    const relative = (energy - initial) / Math.max(1e-6, Math.abs(initial))
    sum += relative
    sumSquares += relative * relative
    count += 1
  }
  if (count === 0) return
  const mean = sum / count
  state.drift = mean
  state.driftSpread = count > 1 ? Math.sqrt(Math.max(0, sumSquares / count - mean * mean)) : 0
}

function tickLive(): void {
  if (!live) return
  const state = live
  const now = performance.now()
  const wallDelta = clamp((now - state.lastWall) / 1000, 0, 0.1)
  state.lastWall = now

  const simDelta = wallDelta * state.settings.speed
  const dt = state.settings.dt
  const substeps = Math.min(200, Math.max(1, Math.ceil(simDelta / dt)))
  const h = simDelta > 0 ? Math.min(dt, simDelta / substeps) : 0
  const dim = state.system.dim
  const xMargin = 0.3 * (state.view.xMax - state.view.xMin)
  const yMargin = 0.3 * (state.view.yMax - state.view.yMin)
  const xLow = state.view.xMin - xMargin
  const xHigh = state.view.xMax + xMargin
  const yLow = state.view.yMin - yMargin
  const yHigh = state.view.yMax + yMargin

  state.respawned.fill(0)

  if (h > 0) {
    for (let step = 0; step < substeps; step += 1) {
      for (let particle = 0; particle < state.count; particle += 1) {
        const offset = particle * dim
        const ok = rk4Step(state.system, state.states, offset, h, state.work)
        if (!ok) {
          respawnParticle(state, particle, true)
          continue
        }
        let healthy = true
        for (let i = 0; i < dim; i += 1) {
          if (!Number.isFinite(state.states[offset + i]) || Math.abs(state.states[offset + i]) > 1e9) {
            healthy = false
            break
          }
        }
        if (!healthy) {
          respawnParticle(state, particle, true)
          continue
        }
        const x = state.states[offset + state.axes.xIndex]
        const y = state.states[offset + state.axes.yIndex]
        if (x < xLow || x > xHigh || y < yLow || y > yHigh) {
          respawnParticle(state, particle, true)
        }
      }
      state.totalSteps += 1
    }
    state.time += substeps * h
  }

  for (let particle = 0; particle < state.count; particle += 1) {
    const offset = particle * dim
    state.positions[2 * particle] = state.states[offset + state.axes.xIndex]
    state.positions[2 * particle + 1] = state.states[offset + state.axes.yIndex]
  }

  state.snapshotCount += 1
  if (state.snapshotCount % 6 === 1) sampleEnergyDrift(state)

  const response: LiveSnapshotResponse = {
    type: 'live-snapshot',
    positions: state.positions,
    respawned: state.respawned,
    time: state.time,
    drift: state.drift,
    driftSpread: state.driftSpread,
    steps: state.totalSteps,
  }
  ctx.postMessage(response, [state.positions.buffer, state.respawned.buffer])
  // The buffers were transferred; allocate fresh ones for the next tick.
  state.positions = new Float32Array(state.count * 2)
  state.respawned = new Uint8Array(state.count)

  const elapsed = performance.now() - now
  state.timer = setTimeout(tickLive, Math.max(0, 16 - elapsed)) as unknown as number
}

function scheduleTick(): void {
  if (!live) return
  live.timer = setTimeout(tickLive, 16) as unknown as number
}

function pauseLive(): void {
  if (!live) return
  if (live.timer !== null) clearTimeout(live.timer)
  live.timer = null
  live.paused = true
}

function resumeLive(): void {
  if (!live || !live.paused) return
  live.paused = false
  live.lastWall = performance.now()
  scheduleTick()
}

// ---------------------------------------------------------------------------
// Phase portrait
// ---------------------------------------------------------------------------

function startPortrait(msg: Extract<WorkerRequest, { type: 'portrait' }>): void {
  const generation = ++portraitGeneration
  let system: CompiledSystem
  try {
    system = getSystem(msg.config)
  } catch (error) {
    ctx.postMessage({ type: 'portrait-error', requestId: msg.requestId, message: errorMessage(error) })
    return
  }

  const xRange = Math.max(1e-9, msg.view.xMax - msg.view.xMin)
  const yRange = Math.max(1e-9, msg.view.yMax - msg.view.yMin)
  const cols = Math.round(clamp(msg.seedCols, 3, 100))
  const rows = Math.round(clamp(msg.seedRows, 3, 100))
  const seedCount = cols * rows
  const maxSegments = Math.max(1, Math.floor(MAX_PORTRAIT_SEGMENTS / seedCount))
  const segments = Math.round(clamp(msg.steps, 1, Math.min(3000, maxSegments)))
  const dim = system.dim
  const dt = clamp(msg.dt, 1e-5, 0.1)
  const axes = msg.axes
  const vertexCount = seedCount * segments * 2
  const data = new Float32Array(vertexCount * 3)
  const energies = new Float64Array(seedCount)
  const state = new Float64Array(dim)
  const work = makeRk4Workspace(dim)
  let processed = 0
  const chunkSize = 20

  const processChunk = (): void => {
    if (generation !== portraitGeneration) return
    try {
      const end = Math.min(seedCount, processed + chunkSize)
      for (let seed = processed; seed < end; seed += 1) {
        const column = seed % cols
        const row = Math.floor(seed / cols)
        const seedX = msg.view.xMin + ((column + 0.5) / cols) * xRange
        const seedY = msg.view.yMin + ((row + 0.5) / rows) * yRange
        seedStateAt(state, 0, dim, axes, seedX, seedY)
        energies[seed] = system.energy(state)

        let previousX = seedX
        let previousY = seedY
        let valid = true
        const seedBase = seed * segments * 2 * 3
        for (let step = 0; step < segments; step += 1) {
          let currentX = previousX
          let currentY = previousY
          if (valid) {
            if (!rk4Step(system, state, 0, dt, work)) {
              valid = false
            } else {
              const nextX = state[axes.xIndex]
              const nextY = state[axes.yIndex]
              if (Number.isFinite(nextX) && Number.isFinite(nextY) && Math.abs(nextX) < 1e9 && Math.abs(nextY) < 1e9) {
                currentX = nextX
                currentY = nextY
              } else {
                valid = false
              }
            }
          }
          const vertex = seedBase + step * 2 * 3
          data[vertex] = previousX
          data[vertex + 1] = previousY
          data[vertex + 2] = 0.5
          data[vertex + 3] = currentX
          data[vertex + 4] = currentY
          data[vertex + 5] = 0.5
          previousX = currentX
          previousY = currentY
        }
      }

      processed = end
      if (processed < seedCount) {
        ctx.postMessage({ type: 'portrait-progress', requestId: msg.requestId, progress: processed / seedCount })
        setTimeout(processChunk, 0)
        return
      }

      const [eLow, eHigh] = robustRange(energies)
      for (let seed = 0; seed < seedCount; seed += 1) {
        const color = normalize(energies[seed], eLow, eHigh)
        const seedBase = seed * segments * 2 * 3
        for (let step = 0; step < segments; step += 1) {
          const vertex = seedBase + step * 2 * 3
          data[vertex + 2] = color
          data[vertex + 5] = color
        }
      }

      const response: PortraitResponse = {
        type: 'portrait',
        requestId: msg.requestId,
        vertexCount,
        data,
        seedCount,
        segments,
        eMin: eLow,
        eMax: eHigh,
      }
      ctx.postMessage(response, [data.buffer])
    } catch (error) {
      ctx.postMessage({ type: 'portrait-error', requestId: msg.requestId, message: errorMessage(error) })
    }
  }

  setTimeout(processChunk, 0)
}

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  switch (message.type) {
    case 'field': {
      try {
        const system = getSystem(message.config)
        const field = computeField(system, message.view, message.axes, message.resolution, message.arrowResolution)
        const response: FieldResponse = { type: 'field', requestId: message.requestId, ...field }
        ctx.postMessage(response, [field.energy.buffer, field.arrows.buffer])
      } catch (error) {
        ctx.postMessage({ type: 'field-error', requestId: message.requestId, message: errorMessage(error) })
      }
      break
    }
    case 'live-start':
      startLive(message.config, message.view, message.axes, message.settings, message.paused)
      break
    case 'live-pause':
      pauseLive()
      break
    case 'live-resume':
      resumeLive()
      break
    case 'live-stop':
      stopLive()
      break
    case 'live-view':
      if (live) live.view = message.view
      break
    case 'live-settings':
      if (live) {
        live.settings = {
          dt: clamp(message.settings.dt, 1e-5, 0.1),
          speed: clamp(message.settings.speed, 0.01, 10),
          count: live.settings.count,
        }
      }
      break
    case 'portrait':
      startPortrait(message)
      break
    case 'cancel-portrait':
      portraitGeneration += 1
      break
  }
}
