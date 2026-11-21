import { test, expect } from '@playwright/test'

/**
 * e2e for multi-selection in a REAL browser — jsdom is structurally blind to
 * d3's native event layer (stopPropagation on mousedown, drag mechanics,
 * pointer-events hit-testing). These tests run against the live dev stack.
 *
 * Prerequisites: dev stack running (make dev), arch graph …0003 seeded.
 */

const ARCH_GRAPH = '/?graph=c0de0000-0000-4000-8000-000000000003'

test.describe('multi-selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ARCH_GRAPH)
    // wait for the graph to render (nodes mounted + measured)
    await page.waitForSelector('.react-flow__node[data-id="ent-graph"]', { timeout: 10000 })
  })

  test('Cmd+click accumulates node selection', async ({ page }) => {
    const n1 = page.locator('.react-flow__node[data-id="ent-graph"]')
    const n2 = page.locator('.react-flow__node[data-id="ent-layout"]')

    // click first node (no modifier) — selects it
    await n1.click()
    await expect(n1).toHaveClass(/selected/)

    // Cmd+click second node — accumulates
    await n2.click({ modifiers: ['Meta'] })
    await expect(n1).toHaveClass(/selected/)
    await expect(n2).toHaveClass(/selected/)
  })

  test('Space+drag box-selects multiple nodes', async ({ page }) => {
    // hold Space, drag a box over several nodes
    await page.keyboard.down('Space')
    const canvas = page.locator('.react-flow')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    // drag over the graph area (nodes are roughly in the middle of the canvas)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Space')

    // at least one node should be selected
    const selected = await page.locator('.react-flow__node.selected').count()
    expect(selected).toBeGreaterThan(0)
  })

  test('right-click on a selected node opens the slice menu (not the browser menu)', async ({ page }) => {
    // first select a node
    const n1 = page.locator('.react-flow__node[data-id="ent-graph"]')
    await n1.click()
    await expect(n1).toHaveClass(/selected/)

    // right-click on it
    await n1.click({ button: 'right' })
    const menu = page.locator('[data-testid="slice-context-menu"]')
    await expect(menu).toBeVisible()
  })

  test('right-click on empty canvas with selection opens the slice menu', async ({ page }) => {
    // select a node first
    const n1 = page.locator('.react-flow__node[data-id="ent-graph"]')
    await n1.click()
    await expect(n1).toHaveClass(/selected/)

    // right-click on the canvas (empty area between nodes, not on any element)
    const n2 = page.locator('.react-flow__node[data-id="ent-layout"]')
    const n2box = await n2.boundingBox()
    if (!n2box) throw new Error('no node box')
    // click slightly below-left of the second node (empty pane area)
    await page.mouse.click(n2box.x + n2box.width + 30, n2box.y + n2box.height + 30, { button: 'right' })

    // the slice context menu should appear (not the browser menu)
    const menu = page.locator('[data-testid="slice-context-menu"]')
    await expect(menu).toBeVisible()
  })

  test('group drag moves all selected nodes', async ({ page }) => {
    const n1 = page.locator('.react-flow__node[data-id="ent-graph"]')
    const n2 = page.locator('.react-flow__node[data-id="ent-layout"]')

    await n1.click()
    await n2.click({ modifiers: ['Meta'] })
    await expect(n1).toHaveClass(/selected/)
    await expect(n2).toHaveClass(/selected/)

    const before1 = await n1.boundingBox()
    const before2 = await n2.boundingBox()
    if (!before1 || !before2) throw new Error('no boxes')

    // drag on the canvas background (not on any node) to move the group
    const canvas = page.locator('.react-flow')
    const cb = await canvas.boundingBox()
    if (!cb) throw new Error('no canvas box')

    await page.mouse.move(before1.x + before1.width / 2, before1.y + before1.height / 2)
    await page.mouse.down()
    await page.mouse.move(before1.x + before1.width / 2 + 100, before1.y + before1.height / 2 + 50, { steps: 5 })
    await page.mouse.up()

    const after1 = await n1.boundingBox()
    const after2 = await n2.boundingBox()
    if (!after1 || !after2) throw new Error('no boxes after')

    // allow zoom-related coordinate scaling tolerance
    expect(Math.abs(after1.x - before1.x - 100)).toBeLessThan(50)
    expect(Math.abs(after2.x - before2.x - 100)).toBeLessThan(50)
  })
})
