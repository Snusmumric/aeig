import { test, expect } from '@playwright/test'

const ARCH_GRAPH = '/?graph=c0de0000-0000-4000-8000-000000000003'

test('Cmd+click: visual outline appears on ALL selected nodes (deep check)', async ({ page }) => {
  await page.goto(ARCH_GRAPH)
  await page.waitForSelector('.react-flow__node[data-id="ent-graph"]', { timeout: 10000 })

  const a = page.locator('.react-flow__node[data-id="ent-graph"]')
  const b = page.locator('.react-flow__node[data-id="ent-layout"]')
  const c = page.locator('.react-flow__node[data-id="ent-node"]')

  // helper: check computed outline style on each node
  const outlineCheck = async () => {
    return page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.react-flow__node')]
      return nodes.map((el) => ({
        id: el.getAttribute('data-id'),
        hasClass: el.classList.contains('selected'),
        outline: getComputedStyle(el).outlineStyle,
        outlineColor: getComputedStyle(el).outlineColor,
        outlineWidth: getComputedStyle(el).outlineWidth,
        zIndex: getComputedStyle(el).zIndex,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
      }))
    })
  }

  await a.click()
  await page.waitForTimeout(100)
  await b.click({ modifiers: ['Meta'] })
  await page.waitForTimeout(100)
  await c.click({ modifiers: ['Meta'] })
  await page.waitForTimeout(500) // generous wait for paint

  const info = await outlineCheck()
  const selected = info.filter((n) => n.hasClass)
  console.log('selected nodes with computed styles:')
  for (const n of selected) {
    console.log(
      `  ${n.id}: class=${n.hasClass} outline=${n.outline} ${n.outlineWidth} ${n.outlineColor} z=${n.zIndex} size=${n.offsetWidth}x${n.offsetHeight}`,
    )
  }

  // EVERY node with .selected must have a visible outline (solid, not none)
  for (const n of selected) {
    expect(n.outline).toBe('solid')
    expect(n.outlineWidth).not.toBe('0px')
  }

  // all three must be selected
  expect(selected.map((n) => n.id)).toEqual(
    expect.arrayContaining(['ent-graph', 'ent-layout', 'ent-node']),
  )

  await page.screenshot({ path: 'test-results/selection-deep-check.png' })
})
