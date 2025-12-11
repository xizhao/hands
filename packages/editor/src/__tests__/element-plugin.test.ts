/**
 * Integration tests for the unified ElementPlugin
 *
 * Tests:
 * 1. isVoid logic - only HTML void tags and explicit isVoid flag
 * 2. isCustomComponent - PascalCase and non-HTML detection
 * 3. End-to-end: source → Plate value → editor.isVoid()
 */

import { describe, test, expect } from 'bun:test'
import {
  HTML_VOID_TAGS,
  HTML_ELEMENTS,
  isCustomComponent,
  shouldBeVoid,
} from '../../demo/plate/plugins/element-plugin'
import { sourceToPlateValueSurgical } from '../../demo/plate/surgical-converters'

// Helper to wrap JSX in block function format
const wrapJsx = (jsx: string) => `
export default (ctx) => (
  ${jsx}
) satisfies BlockFn
`

describe('ElementPlugin', () => {
  describe('isCustomComponent', () => {
    test('PascalCase tags are custom components', () => {
      expect(isCustomComponent('Button')).toBe(true)
      expect(isCustomComponent('Card')).toBe(true)
      expect(isCustomComponent('MyWidget')).toBe(true)
      expect(isCustomComponent('CardHeader')).toBe(true)
      expect(isCustomComponent('MetricCard')).toBe(true)
    })

    test('lowercase HTML tags are NOT custom components', () => {
      expect(isCustomComponent('div')).toBe(false)
      expect(isCustomComponent('span')).toBe(false)
      expect(isCustomComponent('button')).toBe(false)
      expect(isCustomComponent('p')).toBe(false)
      expect(isCustomComponent('h1')).toBe(false)
      expect(isCustomComponent('img')).toBe(false)
      expect(isCustomComponent('input')).toBe(false)
    })

    test('lowercase non-HTML tags ARE custom components', () => {
      expect(isCustomComponent('my-widget')).toBe(true)
      expect(isCustomComponent('x-button')).toBe(true)
      expect(isCustomComponent('custom-element')).toBe(true)
    })
  })

  describe('shouldBeVoid', () => {
    test('HTML void tags are void', () => {
      for (const tag of ['img', 'br', 'hr', 'input', 'meta', 'link']) {
        expect(shouldBeVoid({ type: tag, children: [] })).toBe(true)
      }
    })

    test('HTML non-void tags are NOT void', () => {
      for (const tag of ['div', 'span', 'button', 'p', 'h1', 'section']) {
        expect(shouldBeVoid({ type: tag, children: [] })).toBe(false)
      }
    })

    test('PascalCase components without isVoid flag are NOT void', () => {
      expect(shouldBeVoid({ type: 'Button', children: [] })).toBe(false)
      expect(shouldBeVoid({ type: 'Card', children: [] })).toBe(false)
      expect(shouldBeVoid({ type: 'MetricCard', children: [] })).toBe(false)
    })

    test('elements with explicit isVoid: true ARE void', () => {
      expect(shouldBeVoid({ type: 'Button', children: [], isVoid: true } as any)).toBe(true)
      expect(shouldBeVoid({ type: 'Card', children: [], isVoid: true } as any)).toBe(true)
      expect(shouldBeVoid({ type: 'div', children: [], isVoid: true } as any)).toBe(true)
    })

    test('elements with isVoid: false are NOT void', () => {
      expect(shouldBeVoid({ type: 'Card', children: [], isVoid: false } as any)).toBe(false)
    })
  })

  describe('HTML_VOID_TAGS constant', () => {
    test('contains expected HTML void elements', () => {
      expect(HTML_VOID_TAGS.has('img')).toBe(true)
      expect(HTML_VOID_TAGS.has('br')).toBe(true)
      expect(HTML_VOID_TAGS.has('hr')).toBe(true)
      expect(HTML_VOID_TAGS.has('input')).toBe(true)
      expect(HTML_VOID_TAGS.has('meta')).toBe(true)
      expect(HTML_VOID_TAGS.has('link')).toBe(true)
      expect(HTML_VOID_TAGS.has('area')).toBe(true)
      expect(HTML_VOID_TAGS.has('base')).toBe(true)
      expect(HTML_VOID_TAGS.has('col')).toBe(true)
      expect(HTML_VOID_TAGS.has('embed')).toBe(true)
      expect(HTML_VOID_TAGS.has('source')).toBe(true)
      expect(HTML_VOID_TAGS.has('track')).toBe(true)
      expect(HTML_VOID_TAGS.has('wbr')).toBe(true)
    })

    test('does NOT contain non-void elements', () => {
      expect(HTML_VOID_TAGS.has('div')).toBe(false)
      expect(HTML_VOID_TAGS.has('span')).toBe(false)
      expect(HTML_VOID_TAGS.has('button')).toBe(false)
      expect(HTML_VOID_TAGS.has('p')).toBe(false)
      expect(HTML_VOID_TAGS.has('Card')).toBe(false)
    })
  })

  describe('HTML_ELEMENTS constant', () => {
    test('contains common HTML elements', () => {
      const common = ['div', 'span', 'p', 'button', 'input', 'h1', 'h2', 'h3', 'ul', 'li', 'a', 'img']
      for (const tag of common) {
        expect(HTML_ELEMENTS.has(tag)).toBe(true)
      }
    })

    test('does NOT contain PascalCase (React components)', () => {
      expect(HTML_ELEMENTS.has('Button')).toBe(false)
      expect(HTML_ELEMENTS.has('Card')).toBe(false)
      expect(HTML_ELEMENTS.has('MyComponent')).toBe(false)
    })
  })
})

describe('Integration: Source → Plate Value → isVoid', () => {
  test('HTML elements in source have correct isVoid in Plate value', () => {
    const source = wrapJsx(`<div>
      <h1>Title</h1>
      <p>Content</p>
      <button>Click</button>
      <img src="test.jpg" />
    </div>`)

    const { value } = sourceToPlateValueSurgical(source)

    // Find each element and check isVoid
    const h1 = findElement(value, 'h1')
    const p = findElement(value, 'p')
    const button = findElement(value, 'button')
    const img = findElement(value, 'img')

    expect(h1?.isVoid).toBeFalsy()
    expect(p?.isVoid).toBeFalsy()
    expect(button?.isVoid).toBeFalsy()
    // img IS void because it's an HTML void element
    expect(img?.isVoid).toBe(true)
  })

  test('PascalCase components with children are NOT void', () => {
    const source = wrapJsx(`<Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Content</p>
      </CardContent>
    </Card>`)

    const { value } = sourceToPlateValueSurgical(source)

    const card = findElement(value, 'Card')
    const cardHeader = findElement(value, 'CardHeader')
    const cardTitle = findElement(value, 'CardTitle')
    const cardContent = findElement(value, 'CardContent')

    // All should NOT be void - they have children
    expect(card?.isVoid).toBeFalsy()
    expect(cardHeader?.isVoid).toBeFalsy()
    expect(cardTitle?.isVoid).toBeFalsy()
    expect(cardContent?.isVoid).toBeFalsy()
  })

  test('self-closing PascalCase components ARE void', () => {
    const source = wrapJsx(`<div>
      <MetricCard title="Users" value={100} />
      <Badge variant="success" />
    </div>`)

    const { value } = sourceToPlateValueSurgical(source)

    const metricCard = findElement(value, 'MetricCard')
    const badge = findElement(value, 'Badge')

    // Self-closing = no children = void
    expect(metricCard?.isVoid).toBe(true)
    expect(badge?.isVoid).toBe(true)
  })

  test('shouldBeVoid returns correct results for Plate elements', () => {
    const source = wrapJsx(`<div>
      <Button>Click</Button>
      <MetricCard title="Test" />
      <img src="test.jpg" />
    </div>`)

    const { value } = sourceToPlateValueSurgical(source)

    const button = findElement(value, 'Button')
    const metricCard = findElement(value, 'MetricCard')
    const img = findElement(value, 'img')

    // Test shouldBeVoid function with actual Plate elements
    expect(shouldBeVoid(button!)).toBe(false) // has children text
    expect(shouldBeVoid(metricCard!)).toBe(true) // self-closing
    expect(shouldBeVoid(img!)).toBe(true) // HTML void tag
  })

  test('mixed HTML and components have correct void status', () => {
    const source = wrapJsx(`<section>
      <header>
        <h1>Welcome</h1>
      </header>
      <main>
        <Card>
          <CardContent>
            <p>Text</p>
            <Button variant="primary">Action</Button>
          </CardContent>
        </Card>
        <hr />
        <br />
      </main>
    </section>`)

    const { value } = sourceToPlateValueSurgical(source)

    // HTML non-void
    expect(findElement(value, 'section')?.isVoid).toBeFalsy()
    expect(findElement(value, 'header')?.isVoid).toBeFalsy()
    expect(findElement(value, 'main')?.isVoid).toBeFalsy()
    expect(findElement(value, 'h1')?.isVoid).toBeFalsy()
    expect(findElement(value, 'p')?.isVoid).toBeFalsy()

    // HTML void
    expect(findElement(value, 'hr')?.isVoid).toBe(true)
    expect(findElement(value, 'br')?.isVoid).toBe(true)

    // Components with children - NOT void
    expect(findElement(value, 'Card')?.isVoid).toBeFalsy()
    expect(findElement(value, 'CardContent')?.isVoid).toBeFalsy()
    expect(findElement(value, 'Button')?.isVoid).toBeFalsy()
  })
})

// Helper to recursively find an element by type
function findElement(elements: any[], type: string): any | undefined {
  for (const el of elements) {
    if (el.type === type) return el
    if (el.children && Array.isArray(el.children)) {
      const found = findElement(el.children, type)
      if (found) return found
    }
  }
  return undefined
}
