// The hosted alert feed refuses bad input in plain words, without touching a network.
// The feed on a real vault is checked against the deployed site by e2e/live-check.mjs.
import { expect, test } from '@playwright/test'

test('the alert feed refuses a bad address and a network with real money, naming its own parameters', async ({ request }) => {
  const bad = await request.get('/alerts?chain=84532&vault=0x1234')
  expect(bad.status()).toBe(400)
  expect(await bad.text()).toContain('vault is not an address')

  const mainnet = await request.get('/alerts?chain=1&vault=0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb')
  expect(mainnet.status()).toBe(400)
  const text = await mainnet.text()
  expect(text).toContain('Networks with real money are refused')
  expect(text).not.toContain('HARDSTOP_')
})
