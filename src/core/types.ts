export type Kind = 'hamiltonian' | 'lagrangian'

export type Dof = 1 | 2

export interface SystemConfig {
  kind: Kind
  dof: Dof
  expression: string
  params: Record<string, number>
}

export interface ViewRect {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface AxisSpec {
  /** index into the interleaved state vector */
  xIndex: number
  /** index into the interleaved state vector */
  yIndex: number
  xLabel: string
  yLabel: string
}

export interface LiveSettings {
  /** integration step used by RK4 */
  dt: number
  /** simulated seconds per wall-clock second */
  speed: number
  /** number of particles in the live cloud */
  count: number
}

export interface SimStats {
  time: number
  /** relative energy drift, averaged over a handful of tracer particles */
  drift: number
  /** spread of the relative energy drift */
  driftSpread: number
  particles: number
  steps: number
}
