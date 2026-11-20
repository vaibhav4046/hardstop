import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVaultLink, vaultLink } from './live/link.ts'

const VAULT = '0x47ef758553e8144bc122102815d9f4a39a247c16'
const WHO = '0x000000000000000000000000000000000000beef'

test('a vault link round-trips, with and without a recipient', () => {
  const link = vaultLink('https://example.test', 84532, VAULT, WHO)
  assert.equal(link, `https://example.test/activity?chain=84532&vault=${VAULT}&who=${WHO}`)
  assert.deepEqual(parseVaultLink(new URL(link).search), { chainId: 84532, vault: VAULT, who: WHO })
  assert.deepEqual(parseVaultLink(`?chain=84532&vault=${VAULT.toUpperCase().replace('0X', '0x')}`), { chainId: 84532, vault: VAULT, who: null })
})

test('no vault in the address is not an error; a bad one is', () => {
  assert.equal(parseVaultLink(''), null)
  assert.equal(parseVaultLink('?utm=1'), null)
  for (const bad of [
    `?vault=${VAULT}`,
    '?chain=84532',
    `?chain=1&vault=${VAULT}`,
    `?chain=84532&vault=0x123`,
    `?chain=84532&vault=${VAULT}&who=nobody`,
    `?chain=8e4&vault=${VAULT}`,
  ]) {
    assert.equal(parseVaultLink(bad), 'invalid', bad)
  }
})
