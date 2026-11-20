import assert from 'node:assert/strict'
import { test } from 'node:test'
import { USD, amountError, parseUsd } from '../src/lib/money.ts'

test('a comma is read only as a thousands separator, never as a decimal point', () => {
  // "4,99" written the European way must not become 499 dollars.
  for (const text of ['4,99', '1,5', '1,00', '12,3456', ',5', '1,,000', '1000,']) {
    assert.equal(parseUsd(text), null, text)
    assert.ok(amountError(text, 'the amount'), text)
  }
  assert.equal(parseUsd('1,000'), 1_000n * USD)
  assert.equal(parseUsd('$1,000.50'), 1_000n * USD + 500_000n)
  assert.equal(parseUsd('12,345,678'), 12_345_678n * USD)
  assert.equal(parseUsd('4.99'), 4n * USD + 990_000n)
  assert.equal(parseUsd('10'), 10n * USD)
})
