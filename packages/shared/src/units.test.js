import { describe, expect, it } from 'vitest';
import {
  applyBps,
  decimalToScaledInt,
  fineWeightMg,
  formatINR,
  formatWeight,
  fromMg,
  fromPaise,
  toBps,
  toMg,
  toPaise,
} from './units.js';

describe('decimalToScaledInt', () => {
  it('converts without floating point drift', () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise('0.1')).toBe(10);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise('72,450.50')).toBe(7245050);
    expect(toMg('12.3456')).toBe(12346);
    expect(toMg(12.345)).toBe(12345);
  });

  it('rounds half away from zero', () => {
    expect(decimalToScaledInt('2.5', 0)).toBe(3);
    expect(decimalToScaledInt('-2.5', 0)).toBe(-3);
    expect(decimalToScaledInt('-0.004', 2)).toBe(0);
  });

  it('handles empty and invalid input', () => {
    expect(toPaise('')).toBeNull();
    expect(toPaise(null)).toBeNull();
    expect(() => toPaise('abc')).toThrow(RangeError);
    expect(() => toPaise('.')).toThrow(RangeError);
  });

  it('handles exponent notation numbers', () => {
    expect(toMg(1e-7)).toBe(0);
    expect(toPaise(1e21 / 1e15)).toBe(100000000);
  });

  it('round trips', () => {
    expect(fromPaise(toPaise('1234.56'))).toBe(1234.56);
    expect(fromMg(toMg('0.999'))).toBe(0.999);
  });
});

describe('jewellery arithmetic', () => {
  it('computes fine weight from net weight and fineness', () => {
    expect(fineWeightMg(10000, 916)).toBe(9160);
    expect(fineWeightMg(12345, 750)).toBe(9259);
  });

  it('applies basis points', () => {
    expect(applyBps(10000000, toBps(3))).toBe(300000);
    expect(applyBps(333, 1250)).toBe(42);
  });
});

describe('formatting', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(null)).toBe('—');
  });

  it('formats weight in grams', () => {
    expect(formatWeight(12345)).toBe('12.345 g');
  });
});
