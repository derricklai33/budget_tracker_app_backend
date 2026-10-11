import { rubyFloatToS } from '../src/rails/responses';

describe('rubyFloatToS (Float#to_s as used by ActiveSupport JSON)', () => {
  it.each([
    [12, '12.0'],
    [12.5, '12.5'],
    [-3, '-3.0'],
    [0, '0.0'],
    [0.1, '0.1'],
    [0.0001, '0.0001'],
    [0.00001, '1.0e-05'],
    [1e15, '1000000000000000.0'],
    [1e16, '1.0e+16'],
    [1.5e20, '1.5e+20'],
  ])('%p -> %s', (value, expected) => {
    expect(rubyFloatToS(value)).toBe(expected);
  });

  it('encodes non-finite values as null', () => {
    expect(rubyFloatToS(Number.NaN)).toBeNull();
    expect(rubyFloatToS(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
