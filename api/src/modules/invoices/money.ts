type DecimalInput = string | number | bigint | Decimal;

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

/** Exact rational decimal arithmetic; rounding occurs only at explicit output boundaries. */
export class Decimal {
  readonly numerator: bigint;
  readonly denominator: bigint;
  constructor(numerator: bigint, denominator = 1n) {
    if (!denominator) throw new Error('Division by zero');
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
    const factor = gcd(numerator, denominator);
    this.numerator = numerator / factor;
    this.denominator = denominator / factor;
  }
  add(value: DecimalInput): Decimal { const b = decimal(value); return new Decimal(this.numerator * b.denominator + b.numerator * this.denominator, this.denominator * b.denominator); }
  sub(value: DecimalInput): Decimal { const b = decimal(value); return new Decimal(this.numerator * b.denominator - b.numerator * this.denominator, this.denominator * b.denominator); }
  mul(value: DecimalInput): Decimal { const b = decimal(value); return new Decimal(this.numerator * b.numerator, this.denominator * b.denominator); }
  div(value: DecimalInput): Decimal { const b = decimal(value); return new Decimal(this.numerator * b.denominator, this.denominator * b.numerator); }
  compare(value: DecimalInput): number { const delta = this.sub(value).numerator; return delta < 0n ? -1 : delta > 0n ? 1 : 0; }
  abs(): Decimal { return new Decimal(this.numerator < 0n ? -this.numerator : this.numerator, this.denominator); }
  scaled(places = 2): bigint {
    const numerator = this.numerator * 10n ** BigInt(places);
    const absolute = numerator < 0n ? -numerator : numerator;
    const rounded = absolute / this.denominator + (absolute % this.denominator * 2n >= this.denominator ? 1n : 0n);
    return numerator < 0n ? -rounded : rounded;
  }
  toFixed(places = 2): string {
    const amount = this.scaled(places);
    const digits = (amount < 0n ? -amount : amount).toString().padStart(places + 1, '0');
    return `${amount < 0n ? '-' : ''}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`;
  }
}

export function decimal(value: DecimalInput | null | undefined): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'bigint') return new Decimal(value);
  const text = value == null || value === '' ? '0' : String(value);
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || text.length > 1000) throw new Error('Invalid decimal value');
  const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new Error('Decimal exponent out of range');
  let numerator = BigInt(`${match[1]}${match[2]}${match[3] ?? ''}`);
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  return new Decimal(numerator, exponent < 0 ? 10n ** BigInt(-exponent) : 1n);
}

/** Legacy display conversion only. Authoritative arithmetic uses decimal(). */
export function parseMoney(value: string | number | null | undefined): number {
  const parsed = Number(decimal(value).toFixed(10));
  if (!Number.isFinite(parsed)) throw new Error('Invalid money value');
  return parsed;
}
export function roundMoney(value: DecimalInput): string { return decimal(value).toFixed(); }
export function moneyOrNull(value: string | number | null | undefined): string | null {
  return value == null || value === '' ? null : roundMoney(value);
}
export function moneyToCents(value: DecimalInput): bigint { return decimal(value).scaled(); }
