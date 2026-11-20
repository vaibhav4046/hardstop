// "Connect your AI" on the home page, and the HARDSTOP mark being a real
// vector wherever it is drawn.

import { expect, test } from './helpers'

const CLIENTS = ['Claude', 'ChatGPT', 'Cursor', 'VS Code + Copilot', 'Windsurf', 'Hermes', 'Python']

test.describe('Connect your AI', () => {
  test('lists the assistants with their logos, copies the install line, and links the setup guide', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    const section = page.locator('section[aria-labelledby="connect-title"]')
    await section.scrollIntoViewIfNeeded()

    // One logo per assistant, served from this site and actually drawn.
    const clients = section.getByRole('list', { name: 'Works with' }).getByRole('listitem')
    await expect(clients).toHaveText(CLIENTS)
    const logos = section.locator('.connect-logo')
    await expect(logos).toHaveCount(CLIENTS.length)
    for (const logo of await logos.all()) {
      // Each logo's shape is an SVG on this site, served as one.
      const mask = await logo.evaluate((element) => getComputedStyle(element).maskImage)
      const file = /\/logos\/[a-z]+\.svg/.exec(mask)?.[0] ?? ''
      expect(file, mask).not.toBe('')
      const response = await page.request.get(file)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/svg+xml')
    }

    // Grey until pointed at, then the brand's own colour (Claude's orange).
    const claude = clients.filter({ hasText: 'Claude' }).locator('.connect-logo')
    const colour = () => claude.evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(await colour()).toBe('rgba(236, 236, 236, 0.8)')
    await claude.hover()
    await expect.poll(colour).toBe('rgb(217, 119, 87)')

    // The copy button puts exactly the line on screen on the clipboard, and says so.
    const line = (await section.locator('code').textContent()) ?? ''
    // The documented order: Claude's options, then the server name, then `--` and the command.
    expect(line).toMatch(/^claude mcp add --env HARDSTOP_AGENT_KEY=.* --transport stdio .*hardstop -- npx -y github:vaibhav4046\/hardstop$/)
    await section.getByRole('button', { name: 'Copy' }).click()
    await expect(section.getByRole('button', { name: 'Copied' })).toBeVisible()
    await expect(section.getByRole('status')).toHaveText('Install line copied.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line)

    await expect(section.getByRole('link', { name: 'full setup guide' })).toHaveAttribute(
      'href',
      'https://github.com/vaibhav4046/hardstop/blob/main/web/mcp/README.md',
    )
  })

  test('the HARDSTOP mark is a vector in the header, the footer and the site icon', async ({ page }) => {
    await page.goto('/')
    for (const place of ['header .wordmark', 'footer .wordmark']) {
      const mark = page.locator(`${place} svg.logo`)
      await expect(mark).toHaveCount(1)
      await expect(mark.locator('path, circle, polygon').first()).toBeAttached()
      await expect(page.locator(`${place} img`)).toHaveCount(0)
    }
    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]')
    await expect(icon).toHaveCount(1)
    const response = await page.request.get((await icon.getAttribute('href')) ?? '')
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    expect(await response.text()).toContain('<svg')
    // Link previews need a raster image; it is there and drawn from the same mark.
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image\.png/)
  })
})
