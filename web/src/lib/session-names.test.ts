import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameProblem, sameName } from './session.ts'

test('a recipient name with invisible or text-direction characters is refused', () => {
  for (const name of ['Cloud‮hosting', 'Cloud​hosting', 'Pay⁦me', '﻿Cloud']) assert.ok(nameProblem(name), JSON.stringify(name))
  assert.equal(nameProblem('Cloud hosting'), undefined)
  assert.equal(nameProblem('Café'), undefined)
})

test('a name mixing Latin with Cyrillic or Greek letters is refused', () => {
  for (const name of ['Clоud hosting', 'Cloud hοsting']) assert.ok(nameProblem(name), JSON.stringify(name))
  for (const name of ['Облачный хостинг', 'Φιλοξενία', 'GPU Market 2']) assert.equal(nameProblem(name), undefined, name)
})

test('names that read the same count as the same name', () => {
  assert.ok(sameName('Café', 'Café'), 'composed and decomposed é')
  assert.ok(sameName('Cloud Hosting', 'cloud hosting'))
  assert.ok(!sameName('Cloud hosting', 'Clоud hosting'), 'a Cyrillic look-alike is a different name; the address is what pays')
})
