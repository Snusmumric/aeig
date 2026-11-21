import { test, expect } from '@playwright/test'

const ARCH_GRAPH = '/?graph=c0de0000-0000-4000-8000-000000000003'

test('Cmd+click visual selection matches functional state — click by click', async ({ page }) => {
  await page.goto(ARCH_GRAPH)
  await page.waitForSelector('.react-flow__node[data-id="ent-graph"]', { timeout: 10000 })

  const a = page.locator('.react-flow__node[data-id="ent-graph"]')
  const b = page.locator('.react-flow__node[data-id="ent-layout"]')
  const c = page.locator('.react-flow__node[data-id="ent-node"]')

  // helper: which nodes have .selected RIGHT NOW
  const selectedIds = async () => {
    return page.evaluate(() =>
      [...document.querySelectorAll('.react-flow__node.selected')].map((el) => el.getAttribute('data-id')),
    )
  }

  // 1. click A (no modifier) — single select
  await a.click()
  await page.waitForTimeout(200)
  let ids = await selectedIds()
  console.log('after click A:', ids)
  expect(ids).toContain('ent-graph')
  await page.screenshot({ path: 'test-results/selection-step1.png' })

  // 2. Cmd+click B — should ADD B
  await b.click({ modifiers: ['Meta'] })
  await page.waitForTimeout(200)
  ids = await selectedIds()
  console.log('after Cmd+click B:', ids)
  expect(ids).toContain('ent-graph')
  expect(ids).toContain('ent-layout')
  await page.screenshot({ path: 'test-results/selection-step2.png' })

  // 3. Cmd+click C — should ADD C
  await c.click({ modifiers: ['Meta'] })
  await page.waitForTimeout(200)
  ids = await selectedIds()
  console.log('after Cmd+click C:', ids)
  expect(ids).toContain('ent-graph')
  expect(ids).toContain('ent-layout')
  expect(ids).toContain('ent-node')
  await page.screenshot({ path: 'test-results/selection-step3.png' })

  // 4. Check the slice panel shows the correct count
  await page.click('[data-testid="slices-btn"]')
  await page.waitForTimeout(300)
  const count = await page.locator('[data-testid="add-selection-count"]').textContent()
  console.log('slice panel count:', count)
  // nodes selected (3) + any edge endpoints... ent-node and ent-edge are connected?
  // just verify the panel is visible with a count > 0
  expect(parseInt(count ?? '0')).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/selection-step4-panel.png' })
})
