import { describe, expect, it } from 'vitest'
import {
  collectVariables,
  compileStateFunction,
  differentiate,
  ExprError,
  parseExpression,
  simplify,
  substituteConstants,
} from '../src/core/expr'
import { freeVariables } from '../src/core/system'

function evaluate(source: string, state: Record<string, number>): number {
  const ast = parseExpression(source)
  const names = Object.keys(state)
  const fn = compileStateFunction(ast, names)
  return fn(names.map((name) => state[name]))
}

describe('expression parser', () => {
  it('respects precedence and right associativity', () => {
    expect(evaluate('2 + 3 * 4', {})).toBe(14)
    expect(evaluate('2^3^2', {})).toBe(512)
    expect(evaluate('-q^2', { q: 3 })).toBe(-9)
    expect(evaluate('2^-3', {})).toBe(0.125)
    expect(evaluate('(q + 1) * (q - 1)', { q: 3 })).toBe(8)
    expect(evaluate('2**3', {})).toBe(8)
  })

  it('understands functions and constants', () => {
    expect(evaluate('sin(pi / 2)', {})).toBeCloseTo(1, 12)
    expect(evaluate('sqrt(1 + q^2)', { q: 1 })).toBeCloseTo(Math.sqrt(2), 12)
    expect(evaluate('max(q, p) + min(q, p)', { q: 3, p: -2 })).toBe(1)
    expect(evaluate('log(e)', {})).toBeCloseTo(1, 12)
  })

  it('reports useful errors', () => {
    expect(() => parseExpression('q +')).toThrow(ExprError)
    expect(() => parseExpression('sin q')).toThrow(/needs parentheses/)
    expect(() => parseExpression('nope(q)')).toThrow(/Unknown function/)
    expect(() => parseExpression('q @ p')).toThrow(/Unexpected character/)
  })
})

describe('symbolic differentiation', () => {
  it('differentiates polynomials', () => {
    const ast = parseExpression('q^3 + 2*q*p + p^2')
    const dq = simplify(differentiate(ast, 'q'))
    const dp = simplify(differentiate(ast, 'p'))
    expect(compileStateFunction(dq, ['q', 'p'])([2, 3])).toBeCloseTo(3 * 4 + 2 * 3, 12)
    expect(compileStateFunction(dp, ['q', 'p'])([2, 3])).toBeCloseTo(2 * 2 + 2 * 3, 12)
  })

  it('differentiates transcendental functions', () => {
    const ast = parseExpression('sin(q)^2 + cos(q)^2')
    const derivative = simplify(differentiate(ast, 'q'))
    expect(compileStateFunction(derivative, ['q'])([0.37])).toBeCloseTo(0, 12)
  })

  it('handles parameter substitution', () => {
    const ast = substituteConstants(parseExpression('a*q^2 + b'), { a: 3, b: 5 })
    const derivative = differentiate(ast, 'q')
    expect(compileStateFunction(derivative, ['q'])([4])).toBe(24)
    expect(collectVariables(ast)).toEqual(new Set(['q']))
  })
})

describe('parameter discovery', () => {
  it('finds free variables', () => {
    expect(freeVariables('p^2/2 + a*q^2/2 + k', 'hamiltonian', 1)).toEqual(['a', 'k'])
    expect(freeVariables('v^2/2 + cos(q)', 'lagrangian', 1)).toEqual([])
    expect(freeVariables('qdot^2/2 - q^2/2', 'lagrangian', 1)).toEqual([])
    expect(freeVariables('(p1^2+p2^2)/2 + q1^2*q2 - q2^3/3', 'hamiltonian', 2)).toEqual([])
  })

  it('rejects coordinates that do not exist for the chosen system', () => {
    expect(() => freeVariables('v^2/2 + cos(q)', 'hamiltonian', 1)).toThrow(/not a coordinate/)
    expect(() => freeVariables('p^2/2 + q^2/2', 'lagrangian', 1)).toThrow(/not a coordinate/)
  })
})
