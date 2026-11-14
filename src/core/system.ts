import {
  collectVariables,
  compileStateFunction,
  differentiate,
  ExprError,
  parseExpression,
  renameVariables,
  substituteConstants,
  type CompiledFunction,
  type ExprNode,
} from './expr'
import type { AxisSpec, Dof, Kind, SystemConfig } from './types'

export interface AxisOption {
  index: number
  label: string
  /** description shown in the UI */
  title: string
}

export interface CompiledSystem {
  kind: Kind
  dof: Dof
  /** dimension of the interleaved state: q1,w1,q2,w2,... */
  dim: number
  stateNames: string[]
  expression: string
  params: Record<string, number>
  /** advance the state derivative: out = f(state) */
  deriv: (state: ArrayLike<number>, out: Float64Array) => void
  /** total energy of the state */
  energy: (state: ArrayLike<number>) => number
}

/**
 * The state vector is interleaved: [q1, w1, q2, w2, ...] where w is the
 * canonical momentum for a Hamiltonian system and the velocity for a
 * Lagrangian system.
 */
export function stateNames(kind: Kind, dof: Dof): string[] {
  const names: string[] = []
  for (let i = 1; i <= dof; i += 1) {
    names.push(`q${i}`)
    names.push(kind === 'hamiltonian' ? `p${i}` : `v${i}`)
  }
  return names
}

/** Friendly aliases: q, p / v / qdot refer to the first degree of freedom. */
export function variableAliases(kind: Kind, dof: Dof): Record<string, string> {
  const alias: Record<string, string> = {}
  if (dof >= 1) {
    alias.q = 'q1'
    if (kind === 'hamiltonian') {
      alias.p = 'p1'
    } else {
      alias.v = 'v1'
      alias.qdot = 'v1'
      alias.qdot1 = 'v1'
    }
  }
  for (let i = 1; i <= dof; i += 1) {
    alias[`q${i}`] = `q${i}`
    if (kind === 'hamiltonian') {
      alias[`p${i}`] = `p${i}`
    } else {
      alias[`v${i}`] = `v${i}`
      alias[`qdot${i}`] = `v${i}`
    }
  }
  return alias
}

function labelFor(kind: Kind, dof: Dof, index: number): string {
  const coordinate = Math.floor(index / 2) + 1
  const isMomentum = index % 2 === 1
  if (dof === 1) {
    if (!isMomentum) return 'q'
    return kind === 'hamiltonian' ? 'p' : 'v'
  }
  if (!isMomentum) return `q${coordinate}`
  return kind === 'hamiltonian' ? `p${coordinate}` : `v${coordinate}`
}

export function axisOptions(kind: Kind, dof: Dof): AxisOption[] {
  const options: AxisOption[] = []
  for (let i = 1; i <= dof; i += 1) {
    options.push({
      index: 2 * (i - 1),
      label: dof === 1 ? 'q' : `q${i}`,
      title: dof === 1 ? 'position' : `position ${i}`,
    })
    options.push({
      index: 2 * (i - 1) + 1,
      label: dof === 1 ? (kind === 'hamiltonian' ? 'p' : 'v') : `${kind === 'hamiltonian' ? 'p' : 'v'}${i}`,
      title: kind === 'hamiltonian' ? (dof === 1 ? 'momentum' : `momentum ${i}`) : dof === 1 ? 'velocity' : `velocity ${i}`,
    })
  }
  return options
}

export function makeAxes(kind: Kind, dof: Dof, xIndex: number, yIndex: number): AxisSpec {
  const options = axisOptions(kind, dof)
  const x = options.find((option) => option.index === xIndex) ?? options[0]
  const y =
    options.find((option) => option.index === yIndex && option.index !== x.index) ??
    options.find((option) => option.index !== x.index) ??
    options[1]
  return {
    xIndex: x.index,
    yIndex: y.index,
    xLabel: labelFor(kind, dof, x.index),
    yLabel: labelFor(kind, dof, y.index),
  }
}

/** Free variables are parameters, not phase-space coordinates. */
export function freeVariables(expression: string, kind: Kind, dof: Dof): string[] {
  const ast = parseExpression(expression)
  const renamed = renameVariables(ast, variableAliases(kind, dof))
  const variables = collectVariables(renamed)
  const coordinates = new Set(stateNames(kind, dof))
  const free = [...variables].filter((name) => !coordinates.has(name))
  const reserved = free.find((name) => /^(q|p|v|qdot)\d*$/.test(name))
  if (reserved) {
    throw new ExprError(
      `'${reserved}' is not a coordinate for this system. Coordinates: ${stateNames(kind, dof)
        .map((name) => name.replace('1', ''))
        .join(', ')}${dof === 1 ? ' (or q = q1, p/v = first momentum/velocity)' : ''}`,
    )
  }
  return free.sort()
}

function compileDerivative(node: ExprNode, withRespectTo: string, stateVariables: readonly string[]): CompiledFunction {
  return compileStateFunction(differentiate(node, withRespectTo), stateVariables)
}

function solveLinear(matrix: Float64Array, rhs: Float64Array, n: number, out: Float64Array): void {
  if (n === 1) {
    const m = matrix[0]
    out[0] = Math.abs(m) > 1e-12 ? rhs[0] / m : Number.NaN
    return
  }
  if (n === 2) {
    const m00 = matrix[0]
    const m01 = matrix[1]
    const m10 = matrix[2]
    const m11 = matrix[3]
    const det = m00 * m11 - m01 * m10
    const scale = Math.abs(m00 * m11) + Math.abs(m01 * m10) + 1
    if (Math.abs(det) < 1e-12 * scale) {
      out[0] = Number.NaN
      out[1] = Number.NaN
      return
    }
    out[0] = (rhs[0] * m11 - m01 * rhs[1]) / det
    out[1] = (m00 * rhs[1] - rhs[0] * m10) / det
    return
  }
  // Small generic Gaussian elimination with partial pivoting, for future DOFs.
  const a = matrix.slice()
  const b = rhs.slice()
  for (let column = 0; column < n; column += 1) {
    let pivot = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row * n + column]) > Math.abs(a[pivot * n + column])) pivot = row
    }
    if (Math.abs(a[pivot * n + column]) < 1e-14) {
      out.fill(Number.NaN)
      return
    }
    if (pivot !== column) {
      for (let k = 0; k < n; k += 1) {
        const tmp = a[column * n + k]
        a[column * n + k] = a[pivot * n + k]
        a[pivot * n + k] = tmp
      }
      const tmp = b[column]
      b[column] = b[pivot]
      b[pivot] = tmp
    }
    const diagonal = a[column * n + column]
    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row * n + column] / diagonal
      if (factor === 0) continue
      for (let k = column; k < n; k += 1) {
        a[row * n + k] -= factor * a[column * n + k]
      }
      b[row] -= factor * b[column]
    }
  }
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row]
    for (let column = row + 1; column < n; column += 1) {
      sum -= a[row * n + column] * out[column]
    }
    out[row] = sum / a[row * n + row]
  }
}

function compileHamiltonian(config: SystemConfig, ast: ExprNode): CompiledSystem {
  const names = stateNames(config.kind, config.dof)
  const dof = config.dof
  const energy = compileStateFunction(ast, names)

  const dq: CompiledFunction[] = []
  const dp: CompiledFunction[] = []
  for (let i = 0; i < dof; i += 1) {
    dq.push(compileDerivative(ast, names[2 * i], names))
    dp.push(compileDerivative(ast, names[2 * i + 1], names))
  }

  return {
    kind: config.kind,
    dof,
    dim: 2 * dof,
    stateNames: names,
    expression: config.expression,
    params: config.params,
    deriv(state, out) {
      for (let i = 0; i < dof; i += 1) {
        out[2 * i] = dp[i](state)
        out[2 * i + 1] = -dq[i](state)
      }
    },
    energy,
  }
}

function compileLagrangian(config: SystemConfig, ast: ExprNode): CompiledSystem {
  const names = stateNames(config.kind, config.dof)
  const dof = config.dof
  const lagrangian = compileStateFunction(ast, names)

  const dq: CompiledFunction[] = []
  const dv: CompiledFunction[] = []
  for (let i = 0; i < dof; i += 1) {
    dq.push(compileDerivative(ast, names[2 * i], names))
    dv.push(compileDerivative(ast, names[2 * i + 1], names))
  }

  // mixed[i][j] = d^2 L / dv_i dq_j
  const mixed: CompiledFunction[][] = []
  // mass[i][j] = d^2 L / dv_i dv_j
  const mass: CompiledFunction[][] = []
  for (let i = 0; i < dof; i += 1) {
    const mixedRow: CompiledFunction[] = []
    const massRow: CompiledFunction[] = []
    for (let j = 0; j < dof; j += 1) {
      mixedRow.push(compileDerivative(differentiate(ast, names[2 * i + 1]), names[2 * j], names))
      const second = differentiate(differentiate(ast, names[2 * i + 1]), names[2 * j + 1])
      massRow.push(compileStateFunction(second, names))
    }
    mixed.push(mixedRow)
    mass.push(massRow)
  }

  const scratchMatrix = new Float64Array(dof * dof)
  const scratchRhs = new Float64Array(dof)
  const scratchAcceleration = new Float64Array(dof)

  return {
    kind: config.kind,
    dof,
    dim: 2 * dof,
    stateNames: names,
    expression: config.expression,
    params: config.params,
    deriv(state, out) {
      for (let i = 0; i < dof; i += 1) {
        out[2 * i] = state[2 * i + 1]
        let rhs = dq[i](state)
        for (let j = 0; j < dof; j += 1) {
          rhs -= mixed[i][j](state) * state[2 * j + 1]
        }
        scratchRhs[i] = rhs
      }
      for (let i = 0; i < dof; i += 1) {
        for (let j = 0; j < dof; j += 1) {
          scratchMatrix[i * dof + j] = mass[i][j](state)
        }
      }
      solveLinear(scratchMatrix, scratchRhs, dof, scratchAcceleration)
      for (let i = 0; i < dof; i += 1) {
        out[2 * i + 1] = scratchAcceleration[i]
      }
    },
    energy(state) {
      let momentum = 0
      for (let i = 0; i < dof; i += 1) {
        momentum += dv[i](state) * state[2 * i + 1]
      }
      return momentum - lagrangian(state)
    },
  }
}

export function compileSystem(config: SystemConfig): CompiledSystem {
  if (!config.expression.trim()) throw new ExprError('The expression is empty')
  if (!Number.isFinite(config.dof) || config.dof < 1) throw new ExprError('The number of degrees of freedom must be at least 1')

  const names = stateNames(config.kind, config.dof)
  const parsed = parseExpression(config.expression)
  const renamed = renameVariables(parsed, variableAliases(config.kind, config.dof))
  const used = collectVariables(renamed)
  const parameterNames = [...used].filter((name) => !names.includes(name))
  const reserved = parameterNames.find((name) => /^(q|p|v|qdot)\d*$/.test(name))
  if (reserved) {
    throw new ExprError(`'${reserved}' is not a coordinate for this system (${names.join(', ')})`)
  }
  const parameterValues: Record<string, number> = {}
  for (const name of parameterNames) {
    const value = config.params[name]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ExprError(`Parameter '${name}' needs a finite numeric value`)
    }
    parameterValues[name] = value
  }

  const substituted = substituteConstants(renamed, parameterValues)
  const remaining = collectVariables(substituted)
  const unknown = [...remaining].filter((name) => !names.includes(name))
  if (unknown.length > 0) {
    throw new ExprError(`Unknown variable${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  }

  const expression = config.kind === 'hamiltonian' ? compileHamiltonian(config, substituted) : compileLagrangian(config, substituted)
  return { ...expression, params: parameterValues }
}
