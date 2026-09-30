type SafeExpressionValue = string | number | boolean | null;

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

type OperatorToken = Extract<Token, { type: 'operator' }>;
type ParenToken = Extract<Token, { type: 'paren' }>;
type HelperMap = Record<string, (...args: any[]) => SafeExpressionValue>;

class TokenStream {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }

  next(): Token | null {
    const token = this.peek();
    if (token) {
      this.index += 1;
    }
    return token;
  }

  matchOperator(value: string): OperatorToken | null {
    const token = this.peek();
    if (!token || token.type !== 'operator' || token.value !== value) {
      return null;
    }
    this.index += 1;
    return token;
  }

  matchParen(value: '(' | ')'): ParenToken | null {
    const token = this.peek();
    if (!token || token.type !== 'paren' || token.value !== value) {
      return null;
    }
    this.index += 1;
    return token;
  }

  matchComma(): Extract<Token, { type: 'comma' }> | null {
    const token = this.peek();
    if (!token || token.type !== 'comma') {
      return null;
    }
    this.index += 1;
    return token;
  }
}

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const twoCharOperator = expression.slice(index, index + 2);
    if (['&&', '||', '==', '!=', '>=', '<='].includes(twoCharOperator)) {
      tokens.push({ type: 'operator', value: twoCharOperator });
      index += 2;
      continue;
    }

    if (['+', '-', '*', '/', '%', '<', '>', '!'].includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma' });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      let cursor = index + 1;
      let value = '';
      let closed = false;
      while (cursor < expression.length) {
        const nextChar = expression[cursor];
        if (nextChar === '\\') {
          const escaped = expression[cursor + 1];
          if (escaped === undefined) {
            return null;
          }
          value += escaped;
          cursor += 2;
          continue;
        }
        if (nextChar === char) {
          tokens.push({ type: 'string', value });
          index = cursor + 1;
          closed = true;
          break;
        }
        value += nextChar;
        cursor += 1;
      }
      if (!closed) {
        return null;
      }
      continue;
    }

    const numberMatch = expression.slice(index).match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifierMatch) {
      const identifier = identifierMatch[0];
      if (identifier === 'true' || identifier === 'false') {
        tokens.push({ type: 'boolean', value: identifier === 'true' });
      } else {
        tokens.push({ type: 'identifier', value: identifier });
      }
      index += identifier.length;
      continue;
    }

    return null;
  }

  return tokens;
}

function toNumber(value: SafeExpressionValue): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareValues(left: SafeExpressionValue, right: SafeExpressionValue, operator: string): boolean {
  switch (operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return toNumber(left) < toNumber(right);
    case '<=':
      return toNumber(left) <= toNumber(right);
    case '>':
      return toNumber(left) > toNumber(right);
    case '>=':
      return toNumber(left) >= toNumber(right);
    default:
      throw new Error(`Unsupported comparison operator: ${operator}`);
  }
}

function parsePrimary(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  const token = stream.next();
  if (!token) {
    throw new Error('Unexpected end of expression');
  }

  if (token.type === 'number' || token.type === 'string' || token.type === 'boolean') {
    return token.value;
  }

  if (token.type === 'identifier') {
    if (stream.matchParen('(')) {
      const helper = helpers[token.value];
      if (!helper) {
        throw new Error(`Unknown helper: ${token.value}`);
      }
      const args: SafeExpressionValue[] = [];
      if (!stream.matchParen(')')) {
        while (true) {
          args.push(parseLogicalOr(stream, helpers));
          if (stream.matchParen(')')) {
            break;
          }
          if (!stream.matchComma()) {
            throw new Error('Expected comma');
          }
        }
      }
      return helper(...args);
    }
    throw new Error(`Unknown identifier: ${token.value}`);
  }

  if (token.type === 'paren' && token.value === '(') {
    const value = parseLogicalOr(stream, helpers);
    if (!stream.matchParen(')')) {
      throw new Error('Expected closing parenthesis');
    }
    return value;
  }

  throw new Error('Invalid primary expression');
}

function parseUnary(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  const operator = stream.matchOperator('!') ?? stream.matchOperator('-');
  if (!operator) {
    return parsePrimary(stream, helpers);
  }

  const value = parseUnary(stream, helpers);
  if (operator.value === '!') {
    return !Boolean(value);
  }
  return -toNumber(value);
}

function parseMultiplicative(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseUnary(stream, helpers);

  while (true) {
    const operator = stream.matchOperator('*') ?? stream.matchOperator('/') ?? stream.matchOperator('%');
    if (!operator) {
      return left;
    }
    const right = parseUnary(stream, helpers);
    if (operator.value === '*') {
      left = toNumber(left) * toNumber(right);
    } else if (operator.value === '/') {
      left = toNumber(left) / toNumber(right);
    } else {
      left = toNumber(left) % toNumber(right);
    }
  }
}

function parseAdditive(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseMultiplicative(stream, helpers);

  while (true) {
    const operator = stream.matchOperator('+') ?? stream.matchOperator('-');
    if (!operator) {
      return left;
    }
    const right = parseMultiplicative(stream, helpers);
    if (operator.value === '+' && (typeof left === 'string' || typeof right === 'string')) {
      left = String(left ?? '') + String(right ?? '');
    } else if (operator.value === '+') {
      left = toNumber(left) + toNumber(right);
    } else {
      left = toNumber(left) - toNumber(right);
    }
  }
}

function parseComparison(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseAdditive(stream, helpers);

  while (true) {
    const operator =
      stream.matchOperator('>=') ??
      stream.matchOperator('<=') ??
      stream.matchOperator('>') ??
      stream.matchOperator('<');
    if (!operator) {
      return left;
    }
    const right = parseAdditive(stream, helpers);
    left = compareValues(left, right, operator.value);
  }
}

function parseEquality(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseComparison(stream, helpers);

  while (true) {
    const operator = stream.matchOperator('==') ?? stream.matchOperator('!=');
    if (!operator) {
      return left;
    }
    const right = parseComparison(stream, helpers);
    left = compareValues(left, right, operator.value);
  }
}

function parseLogicalAnd(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseEquality(stream, helpers);

  while (stream.matchOperator('&&')) {
    const right = parseEquality(stream, helpers);
    left = Boolean(left) && Boolean(right);
  }

  return left;
}

function parseLogicalOr(stream: TokenStream, helpers: HelperMap): SafeExpressionValue {
  let left = parseLogicalAnd(stream, helpers);

  while (stream.matchOperator('||')) {
    const right = parseLogicalAnd(stream, helpers);
    left = Boolean(left) || Boolean(right);
  }

  return left;
}

function evaluateExpressionInternal(expression: string, helpers: HelperMap): SafeExpressionValue | null {
  const tokens = tokenize(expression);
  if (!tokens) {
    return null;
  }

  try {
    const stream = new TokenStream(tokens);
    const result = parseLogicalOr(stream, helpers);
    if (stream.peek()) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export function evaluateSafeNumericExpression(expression: string, helpers: HelperMap = {}): number | null {
  const result = evaluateExpressionInternal(expression, helpers);
  return typeof result === 'number' && Number.isFinite(result) ? result : result === null ? null : toNumber(result);
}

export function evaluateSafeBooleanExpression(expression: string, helpers: HelperMap = {}): boolean {
  return Boolean(evaluateExpressionInternal(expression, helpers));
}
