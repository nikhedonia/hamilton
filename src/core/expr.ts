/**
 * A tiny expression language for physical systems.
 *
 * It is intentionally small: numbers, variables, + - * / ^, parentheses and a
 * handful of elementary functions.  The parsed tree can be symbolically
 * differentiated and compiled to a plain JavaScript function.
 */

export type ExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-' | '+'; arg: ExprNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: ExprNode; right: ExprNode }
  | { kind: 'call'; name: string; args: ExprNode[] }

export class ExprError extends Error {
  readonly pos: number

  constructor(message: string, pos = 0) {
    super(message)
    this.name = 'ExprError'
    this.pos = pos
  }
}

type TokenKind = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof'

interface Token {
  kind: TokenKind
  value: string
  pos: number
}

const FUNCTIONS: Record<string, number> = {
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sinh: 1,
  cosh: 1,
  tanh: 1,
  exp: 1,
  log: 1,
  ln: 1,
  log10: 1,
  sqrt: 1,
  abs: 1,
  sign: 1,
  min: 2,
  max: 2,
  pow: 2,
  atan2: 2,
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)

const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_π]/.test(ch)
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function lex(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '#') {
      // allow comments until the end of the line
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      const rest = source.slice(i)
      const match = NUMBER_RE.exec(rest)
      if (!match) throw new ExprError(`Invalid number at position ${i}`, i)
      tokens.push({ kind: 'num', value: match[0], pos: i })
      i += match[0].length
      continue
    }
    if (isIdentStart(ch)) {
      let j = i + 1
      while (j < source.length && isIdentPart(source[j])) j += 1
      tokens.push({ kind: 'ident', value: source.slice(i, j), pos: i })
      i = j
      continue
    }
    if (source.startsWith('**', i)) {
      tokens.push({ kind: 'op', value: '^', pos: i })
      i += 2
      continue
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', value: ch, pos: i })
      i += 1
      continue
    }
    throw new ExprError(`Unexpected character '${ch}' at position ${i}`, i)
  }
  tokens.push({ kind: 'eof', value: '', pos: source.length })
  return tokens
}

class Parser {
  private readonly tokens: Token[]
  private index = 0

  constructor(source: string) {
    this.tokens = lex(source)
  }

  parse(): ExprNode {
    const expression = this.parseAdditive()
    const token = this.peek()
    if (token.kind !== 'eof') {
      throw new ExprError(`Unexpected '${token.value}' at position ${token.pos}`, token.pos)
    }
    return expression
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private take(): Token {
    const token = this.tokens[this.index]
    this.index += 1
    return token
  }

  private isOp(...ops: string[]): boolean {
    const token = this.peek()
    return token.kind === 'op' && ops.includes(token.value)
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative()
    for (;;) {
      if (this.isOp('+', '-')) {
        const op = this.take().value as '+' | '-'
        const right = this.parseMultiplicative()
        left = { kind: 'binary', op, left, right }
      } else {
        return left
      }
    }
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parseUnary()
    for (;;) {
      if (this.isOp('*', '/')) {
        const op = this.take().value as '*' | '/'
        const right = this.parseUnary()
        left = { kind: 'binary', op, left, right }
      } else {
        return left
      }
    }
  }

  private parseUnary(): ExprNode {
    if (this.isOp('+', '-')) {
      const token = this.take()
      const arg = this.parseUnary()
      if (token.value === '+') return arg
      return { kind: 'unary', op: '-', arg }
    }
    return this.parsePower()
  }

  private parsePower(): ExprNode {
    const left = this.parsePrimary()
    if (this.isOp('^')) {
      this.take()
      const right = this.parseUnary()
      return { kind: 'binary', op: '^', left, right }
    }
    return left
  }

  private parsePrimary(): ExprNode {
    const token = this.peek()
    if (token.kind === 'num') {
      this.take()
      return { kind: 'num', value: Number(token.value) }
    }
    if (token.kind === 'ident') {
      this.take()
      const name = token.value
      if (this.peek().kind === 'lparen') {
        if (!(name in FUNCTIONS)) {
          throw new ExprError(`Unknown function '${name}'`, token.pos)
        }
        this.take() // (
        const args: ExprNode[] = []
        if (this.peek().kind !== 'rparen') {
          for (;;) {
            args.push(this.parseAdditive())
            if (this.peek().kind === 'comma') {
              this.take()
              continue
            }
            break
          }
        }
        const closing = this.peek()
        if (closing.kind !== 'rparen') {
          throw new ExprError(`Expected ')' at position ${closing.pos}`, closing.pos)
        }
        this.take()
        const arity = FUNCTIONS[name]
        if (args.length !== arity) {
          throw new ExprError(
            `Function '${name}' expects ${arity} argument${arity === 1 ? '' : 's'}, got ${args.length}`,
            token.pos,
          )
        }
        if (name === 'pow') {
          return { kind: 'binary', op: '^', left: args[0], right: args[1] }
        }
        return { kind: 'call', name, args }
      }
      if (name in FUNCTIONS) {
        throw new ExprError(`Function '${name}' needs parentheses`, token.pos)
      }
      if (name === 'pi' || name === 'π') return { kind: 'num', value: Math.PI }
      if (name === 'e') return { kind: 'num', value: Math.E }
      if (name === 'tau') return { kind: 'num', value: Math.PI * 2 }
      return { kind: 'var', name }
    }
    if (token.kind === 'lparen') {
      this.take()
      const expression = this.parseAdditive()
      const closing = this.peek()
      if (closing.kind !== 'rparen') {
        throw new ExprError(`Expected ')' at position ${closing.pos}`, closing.pos)
      }
      this.take()
      return expression
    }
    throw new ExprError(
      token.kind === 'eof' ? 'Unexpected end of expression' : `Unexpected '${token.value}'`,
      token.pos,
    )
  }
}

export function parseExpression(source: string): ExprNode {
  if (!source.trim()) throw new ExprError('The expression is empty', 0)
  return new Parser(source).parse()
}

export const num = (value: number): ExprNode => ({ kind: 'num', value })
export const variable = (name: string): ExprNode => ({ kind: 'var', name })

export function neg(arg: ExprNode): ExprNode {
  return simplify({ kind: 'unary', op: '-', arg })
}

export function add(left: ExprNode, right: ExprNode): ExprNode {
  return simplify({ kind: 'binary', op: '+', left, right })
}

export function sub(left: ExprNode, right: ExprNode): ExprNode {
  return simplify({ kind: 'binary', op: '-', left, right })
}

export function mul(left: ExprNode, right: ExprNode): ExprNode {
  return simplify({ kind: 'binary', op: '*', left, right })
}

export function div(left: ExprNode, right: ExprNode): ExprNode {
  return simplify({ kind: 'binary', op: '/', left, right })
}

export function pow(left: ExprNode, right: ExprNode): ExprNode {
  return simplify({ kind: 'binary', op: '^', left, right })
}

export function call(name: string, ...args: ExprNode[]): ExprNode {
  return simplify({ kind: 'call', name, args })
}

function applyFunction(name: string, args: number[]): number {
  switch (name) {
    case 'sin':
      return Math.sin(args[0])
    case 'cos':
      return Math.cos(args[0])
    case 'tan':
      return Math.tan(args[0])
    case 'asin':
      return Math.asin(args[0])
    case 'acos':
      return Math.acos(args[0])
    case 'atan':
      return Math.atan(args[0])
    case 'sinh':
      return Math.sinh(args[0])
    case 'cosh':
      return Math.cosh(args[0])
    case 'tanh':
      return Math.tanh(args[0])
    case 'exp':
      return Math.exp(args[0])
    case 'log':
    case 'ln':
      return Math.log(args[0])
    case 'log10':
      return Math.log10(args[0])
    case 'sqrt':
      return Math.sqrt(args[0])
    case 'abs':
      return Math.abs(args[0])
    case 'sign':
      return Math.sign(args[0])
    case 'min':
      return Math.min(args[0], args[1])
    case 'max':
      return Math.max(args[0], args[1])
    case 'pow':
      return Math.pow(args[0], args[1])
    case 'atan2':
      return Math.atan2(args[0], args[1])
    default:
      throw new ExprError(`Unknown function '${name}'`)
  }
}

/** Evaluate a fully constant subtree, or return null. */
export function evalConst(node: ExprNode): number | null {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'var':
      return null
    case 'unary': {
      const value = evalConst(node.arg)
      if (value === null) return null
      return node.op === '-' ? -value : value
    }
    case 'binary': {
      const left = evalConst(node.left)
      const right = evalConst(node.right)
      if (left === null || right === null) return null
      let value: number
      switch (node.op) {
        case '+':
          value = left + right
          break
        case '-':
          value = left - right
          break
        case '*':
          value = left * right
          break
        case '/':
          value = left / right
          break
        case '^':
          value = Math.pow(left, right)
          break
      }
      return Number.isFinite(value) ? value : null
    }
    case 'call': {
      const values: number[] = []
      for (const arg of node.args) {
        const value = evalConst(arg)
        if (value === null) return null
        values.push(value)
      }
      if (node.name === 'min' || node.name === 'max') {
        return applyFunction(node.name, values)
      }
      const value = applyFunction(node.name, values)
      return Number.isFinite(value) ? value : null
    }
  }
}

function sameNode(a: ExprNode, b: ExprNode): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'num':
      return b.kind === 'num' && a.value === b.value
    case 'var':
      return b.kind === 'var' && a.name === b.name
    case 'unary':
      return b.kind === 'unary' && a.op === b.op && sameNode(a.arg, b.arg)
    case 'binary':
      return b.kind === 'binary' && a.op === b.op && sameNode(a.left, b.left) && sameNode(a.right, b.right)
    case 'call':
      return (
        b.kind === 'call' &&
        a.name === b.name &&
        a.args.length === b.args.length &&
        a.args.every((arg, i) => sameNode(arg, b.args[i]))
      )
  }
}

export function simplify(node: ExprNode): ExprNode {
  switch (node.kind) {
    case 'num':
    case 'var':
      return node
    case 'unary': {
      const arg = simplify(node.arg)
      if (arg.kind === 'num') return { kind: 'num', value: node.op === '-' ? -arg.value : arg.value }
      if (node.op === '+') return arg
      if (arg.kind === 'unary' && arg.op === '-') return arg.arg
      return { kind: 'unary', op: node.op, arg }
    }
    case 'binary': {
      const left = simplify(node.left)
      const right = simplify(node.right)
      if (left.kind === 'num' && right.kind === 'num') {
        const folded = evalConst({ kind: 'binary', op: node.op, left, right })
        if (folded !== null) return { kind: 'num', value: folded }
      }
      switch (node.op) {
        case '+':
          if (left.kind === 'num' && left.value === 0) return right
          if (right.kind === 'num' && right.value === 0) return left
          break
        case '-':
          if (right.kind === 'num' && right.value === 0) return left
          if (sameNode(left, right)) return { kind: 'num', value: 0 }
          if (left.kind === 'num' && left.value === 0) return neg(right)
          break
        case '*':
          if ((left.kind === 'num' && left.value === 0) || (right.kind === 'num' && right.value === 0)) {
            return { kind: 'num', value: 0 }
          }
          if (left.kind === 'num' && left.value === 1) return right
          if (right.kind === 'num' && right.value === 1) return left
          if (left.kind === 'num' && left.value === -1) return neg(right)
          if (right.kind === 'num' && right.value === -1) return neg(left)
          break
        case '/':
          if (right.kind === 'num' && right.value === 1) return left
          if (left.kind === 'num' && left.value === 0 && !(right.kind === 'num' && right.value === 0)) {
            return { kind: 'num', value: 0 }
          }
          break
        case '^':
          if (right.kind === 'num' && right.value === 0) return { kind: 'num', value: 1 }
          if (right.kind === 'num' && right.value === 1) return left
          if (left.kind === 'num' && left.value === 1) return { kind: 'num', value: 1 }
          if (left.kind === 'num' && left.value === 0 && right.kind === 'num' && right.value > 0) {
            return { kind: 'num', value: 0 }
          }
          break
      }
      return { kind: 'binary', op: node.op, left, right }
    }
    case 'call': {
      const args = node.args.map(simplify)
      const folded = evalConst({ kind: 'call', name: node.name, args })
      if (folded !== null) return { kind: 'num', value: folded }
      return { kind: 'call', name: node.name, args }
    }
  }
}

export function collectVariables(node: ExprNode, out = new Set<string>()): Set<string> {
  switch (node.kind) {
    case 'var':
      out.add(node.name)
      break
    case 'unary':
      collectVariables(node.arg, out)
      break
    case 'binary':
      collectVariables(node.left, out)
      collectVariables(node.right, out)
      break
    case 'call':
      for (const arg of node.args) collectVariables(arg, out)
      break
    case 'num':
      break
  }
  return out
}

export function renameVariables(node: ExprNode, mapping: Readonly<Record<string, string>>): ExprNode {
  switch (node.kind) {
    case 'var':
      return { kind: 'var', name: mapping[node.name] ?? node.name }
    case 'unary':
      return { kind: 'unary', op: node.op, arg: renameVariables(node.arg, mapping) }
    case 'binary':
      return {
        kind: 'binary',
        op: node.op,
        left: renameVariables(node.left, mapping),
        right: renameVariables(node.right, mapping),
      }
    case 'call':
      return { kind: 'call', name: node.name, args: node.args.map((arg) => renameVariables(arg, mapping)) }
    case 'num':
      return node
  }
}

export function substituteConstants(node: ExprNode, values: Readonly<Record<string, number>>): ExprNode {
  const substituted = substituteWalk(node, values)
  return simplify(substituted)
}

function substituteWalk(node: ExprNode, values: Readonly<Record<string, number>>): ExprNode {
  switch (node.kind) {
    case 'var':
      return node.name in values ? { kind: 'num', value: values[node.name] } : node
    case 'unary':
      return { kind: 'unary', op: node.op, arg: substituteWalk(node.arg, values) }
    case 'binary':
      return {
        kind: 'binary',
        op: node.op,
        left: substituteWalk(node.left, values),
        right: substituteWalk(node.right, values),
      }
    case 'call':
      return { kind: 'call', name: node.name, args: node.args.map((arg) => substituteWalk(arg, values)) }
    case 'num':
      return node
  }
}

function unsupportedDerivative(node: ExprNode): never {
  const name = node.kind === 'call' ? node.name : node.kind
  throw new ExprError(`Cannot differentiate '${name}' symbolically`)
}

/** Symbolic derivative with respect to a variable. */
export function differentiate(node: ExprNode, variableName: string): ExprNode {
  switch (node.kind) {
    case 'num':
      return num(0)
    case 'var':
      return num(node.name === variableName ? 1 : 0)
    case 'unary':
      return node.op === '-' ? neg(differentiate(node.arg, variableName)) : differentiate(node.arg, variableName)
    case 'binary': {
      const { left, right } = node
      switch (node.op) {
        case '+':
          return add(differentiate(left, variableName), differentiate(right, variableName))
        case '-':
          return sub(differentiate(left, variableName), differentiate(right, variableName))
        case '*':
          return add(mul(differentiate(left, variableName), right), mul(left, differentiate(right, variableName)))
        case '/':
          return div(
            sub(mul(differentiate(left, variableName), right), mul(left, differentiate(right, variableName))),
            pow(right, num(2)),
          )
        case '^': {
          const leftPrime = differentiate(left, variableName)
          if (right.kind === 'num') {
            return mul(mul(right, pow(left, num(right.value - 1))), leftPrime)
          }
          const rightPrime = differentiate(right, variableName)
          return mul(
            pow(left, right),
            add(mul(rightPrime, call('log', left)), div(mul(right, leftPrime), left)),
          )
        }
      }
      break
    }
    case 'call': {
      const a = node.args[0]
      const da = differentiate(a, variableName)
      switch (node.name) {
        case 'sin':
          return mul(call('cos', a), da)
        case 'cos':
          return neg(mul(call('sin', a), da))
        case 'tan':
          return div(da, pow(call('cos', a), num(2)))
        case 'asin':
          return div(da, call('sqrt', sub(num(1), pow(a, num(2)))))
        case 'acos':
          return neg(div(da, call('sqrt', sub(num(1), pow(a, num(2))))))
        case 'atan':
          return div(da, add(num(1), pow(a, num(2))))
        case 'sinh':
          return mul(call('cosh', a), da)
        case 'cosh':
          return mul(call('sinh', a), da)
        case 'tanh':
          return mul(sub(num(1), pow(call('tanh', a), num(2))), da)
        case 'exp':
          return mul(call('exp', a), da)
        case 'log':
        case 'ln':
          return div(da, a)
        case 'log10':
          return div(da, mul(a, num(Math.LN10)))
        case 'sqrt':
          return div(da, mul(num(2), call('sqrt', a)))
        case 'abs':
          return mul(call('sign', a), da)
        case 'sign':
          return num(0)
        case 'pow':
          return differentiate({ kind: 'binary', op: '^', left: node.args[0], right: node.args[1] }, variableName)
        case 'atan2': {
          const y = node.args[0]
          const x = node.args[1]
          const dy = differentiate(y, variableName)
          const dx = differentiate(x, variableName)
          return div(
            sub(mul(x, dy), mul(y, dx)),
            add(pow(x, num(2)), pow(y, num(2))),
          )
        }
        default:
          return unsupportedDerivative(node)
      }
    }
  }
  return unsupportedDerivative(node)
}

function formatNumber(value: number): string {
  if (Object.is(value, -0)) return '0'
  return String(value)
}

function functionSource(name: string): string {
  switch (name) {
    case 'sin':
      return 'Math.sin'
    case 'cos':
      return 'Math.cos'
    case 'tan':
      return 'Math.tan'
    case 'asin':
      return 'Math.asin'
    case 'acos':
      return 'Math.acos'
    case 'atan':
      return 'Math.atan'
    case 'sinh':
      return 'Math.sinh'
    case 'cosh':
      return 'Math.cosh'
    case 'tanh':
      return 'Math.tanh'
    case 'exp':
      return 'Math.exp'
    case 'log':
    case 'ln':
      return 'Math.log'
    case 'log10':
      return 'Math.log10'
    case 'sqrt':
      return 'Math.sqrt'
    case 'abs':
      return 'Math.abs'
    case 'sign':
      return 'Math.sign'
    case 'min':
      return 'Math.min'
    case 'max':
      return 'Math.max'
    case 'pow':
      return 'Math.pow'
    case 'atan2':
      return 'Math.atan2'
    default:
      throw new ExprError(`Unknown function '${name}'`)
  }
}

export function toSource(node: ExprNode): string {
  switch (node.kind) {
    case 'num':
      return formatNumber(node.value)
    case 'var':
      return node.name
    case 'unary':
      return `(-(${toSource(node.arg)}))`
    case 'binary': {
      const left = toSource(node.left)
      const right = toSource(node.right)
      switch (node.op) {
        case '+':
          return `(${left} + ${right})`
        case '-':
          return `(${left} - ${right})`
        case '*':
          return `(${left} * ${right})`
        case '/':
          return `(${left} / ${right})`
        case '^': {
          if (node.right.kind === 'num') {
            const exponent = node.right.value
            if (Number.isInteger(exponent) && exponent >= 2 && exponent <= 6) {
              return `(${Array.from({ length: exponent }, () => left).join(' * ')})`
            }
            if (exponent === 0.5) return `Math.sqrt(${left})`
            if (exponent === -1) return `(1 / ${left})`
            if (exponent === -2) return `(1 / (${left} * ${left}))`
          }
          return `Math.pow(${left}, ${right})`
        }
      }
      break
    }
    case 'call': {
      const args = node.args.map(toSource).join(', ')
      if (node.name === 'min' || node.name === 'max') {
        return `${functionSource(node.name)}(${args})`
      }
      return `${functionSource(node.name)}(${args})`
    }
  }
  throw new ExprError('Cannot compile expression')
}

export type CompiledFunction = (state: ArrayLike<number>) => number

/**
 * Compile an expression to a function that reads its variables from a state
 * array.  Variables are declared as locals once, which lets V8 optimise the
 * hot path inside the integrator.
 */
export function compileStateFunction(node: ExprNode, stateVariables: readonly string[]): CompiledFunction {
  const body = toSource(node)
  const declarations = stateVariables.map((name, index) => `const ${name} = s[${index}];`).join('\n')
  const source = `"use strict";\nreturn function (s) {\n${declarations}\nreturn (${body});\n};`
  try {
    const factory = new Function(source) as () => CompiledFunction
    return factory()
  } catch (error) {
    throw new ExprError(
      `Could not compile expression: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
