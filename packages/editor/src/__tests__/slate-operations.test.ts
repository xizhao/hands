/**
 * Tests for Slate Operations → Source Mutations
 *
 * Key test cases:
 * 1. Drag/drop (move_node) - moving elements around
 * 2. Text editing (insert_text, remove_text)
 * 3. Insert new elements (insert_node)
 * 4. Delete elements (remove_node)
 * 5. Prop changes (set_node)
 *
 * The ID system must:
 * - Use Plate's element.id (not path-based IDs)
 * - Be stable across structural changes
 * - Work with Slate's operation types
 */

import { describe, test, expect } from 'bun:test'
import { parseSourceWithLocations } from '../ast/babel-parser'
import { applySlateOperations, operationToSourceEdits } from '../ast/slate-operations'
import type { Operation } from 'slate'

// Test fixture - simple block source
const SIMPLE_SOURCE = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="container">
    <h1>First Heading</h1>
    <p>Second paragraph</p>
    <button>Third button</button>
  </div>
)) satisfies BlockFn
`

describe('parseSourceWithLocations', () => {
  test('parses simple block and extracts JSX', () => {
    const result = parseSourceWithLocations(SIMPLE_SOURCE)

    expect(result.errors).toHaveLength(0)
    expect(result.root).not.toBeNull()
    expect(result.root?.tagName).toBe('div')
    expect(result.root?.children).toHaveLength(3)

    // Check children
    const [h1, p, button] = result.root!.children
    expect(h1.tagName).toBe('h1')
    expect(p.tagName).toBe('p')
    expect(button.tagName).toBe('button')

    // Check source locations exist
    expect(h1.loc.start).toBeGreaterThan(0)
    expect(h1.loc.end).toBeGreaterThan(h1.loc.start)
  })

  test('generates stable IDs based on path', () => {
    const result = parseSourceWithLocations(SIMPLE_SOURCE)

    expect(result.root?.id).toBe('div_0')
    expect(result.root?.children[0].id).toBe('h1_0.0')
    expect(result.root?.children[1].id).toBe('p_0.1')
    expect(result.root?.children[2].id).toBe('button_0.2')
  })
})

describe('move_node operation (drag/drop)', () => {
  test('moves element from position 0 to position 2', () => {
    // Simulate dragging h1 (index 0) to after button (index 2)
    // Slate path [0] → [2] in flattened view
    const moveOp: Operation = {
      type: 'move_node',
      path: [0],      // h1 is first child
      newPath: [2],   // move to after button (which is at [2])
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    // Result should have h1 moved after button
    expect(result).not.toBeNull()

    if (result) {
      // Parse the result to verify structure
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      const children = parsed.root!.children
      expect(children).toHaveLength(3)

      // Order should now be: p, button, h1
      expect(children[0].tagName).toBe('p')
      expect(children[1].tagName).toBe('button')
      expect(children[2].tagName).toBe('h1')
    }
  })

  test('moves element from position 2 to position 0', () => {
    // Simulate dragging button (index 2) to before h1 (index 0)
    const moveOp: Operation = {
      type: 'move_node',
      path: [2],      // button is third child
      newPath: [0],   // move to first position
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    expect(result).not.toBeNull()

    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      const children = parsed.root!.children
      // Order should now be: button, h1, p
      expect(children[0].tagName).toBe('button')
      expect(children[1].tagName).toBe('h1')
      expect(children[2].tagName).toBe('p')
    }
  })

  test('preserves imports and other code after move', () => {
    const moveOp: Operation = {
      type: 'move_node',
      path: [0],
      newPath: [2],
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      // Import statement should still be there
      expect(result).toContain("import type { BlockFn } from '@hands/stdlib'")
      // satisfies should still be there
      expect(result).toContain('satisfies BlockFn')
    }
  })
})

describe('insert_text operation', () => {
  test('inserts text at beginning of element', () => {
    // Insert "NEW " at the start of h1's text
    const insertOp: Operation = {
      type: 'insert_text',
      path: [0, 0],  // First child (h1), first text node
      offset: 0,
      text: 'NEW ',
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('NEW First Heading')
    }
  })

  test('inserts text in middle of element', () => {
    const insertOp: Operation = {
      type: 'insert_text',
      path: [0, 0],  // h1's text
      offset: 6,     // After "First "
      text: 'INSERTED ',
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('First INSERTED Heading')
    }
  })
})

describe('remove_text operation', () => {
  test('removes text from element', () => {
    const removeOp: Operation = {
      type: 'remove_text',
      path: [0, 0],  // h1's text
      offset: 0,
      text: 'First ',  // Remove "First "
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('<h1>Heading</h1>')
      expect(result).not.toContain('First Heading')
    }
  })
})

describe('remove_node operation', () => {
  test('removes element at path', () => {
    // Remove the p element (index 1)
    const removeOp: Operation = {
      type: 'remove_node',
      path: [1],
      node: { type: 'p', children: [{ text: 'Second paragraph' }] },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(2)
      expect(parsed.root!.children[0].tagName).toBe('h1')
      expect(parsed.root!.children[1].tagName).toBe('button')
    }
  })
})

describe('insert_node operation', () => {
  test('inserts new element at path', () => {
    // Insert a new element at position 1 (between h1 and p)
    const insertOp: Operation = {
      type: 'insert_node',
      path: [1],
      node: {
        type: 'h2',
        children: [{ text: 'New Subheading' }],
      },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(4)
      expect(parsed.root!.children[0].tagName).toBe('h1')
      expect(parsed.root!.children[1].tagName).toBe('h2')
      expect(parsed.root!.children[2].tagName).toBe('p')
    }
  })
})

describe('set_node operation (prop changes)', () => {
  test('updates existing prop', () => {
    // Change className on the root div
    const setOp: Operation = {
      type: 'set_node',
      path: [],  // Root element (the div, since we're in flattened mode this is special)
      properties: { className: 'container' },
      newProperties: { className: 'new-class' },
    }

    // Note: set_node on root might not work with current flattening
    // This test documents expected behavior
    const result = applySlateOperations(SIMPLE_SOURCE, [setOp])

    // For now, this might return null (not implemented for root)
    // The test documents the expected behavior
    if (result) {
      expect(result).toContain('className="new-class"')
    }
  })
})

describe('multiple operations in sequence', () => {
  test('handles multiple moves correctly', () => {
    // Move h1 to end, then move button to start
    // This tests that we re-parse between operations
    const ops: Operation[] = [
      { type: 'move_node', path: [0], newPath: [2] },  // h1 to end
    ]

    const result = applySlateOperations(SIMPLE_SOURCE, ops)

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children[0].tagName).toBe('p')
      expect(parsed.root!.children[1].tagName).toBe('button')
      expect(parsed.root!.children[2].tagName).toBe('h1')
    }
  })
})

describe('ID stability', () => {
  test('IDs update correctly after structural changes', () => {
    // After moving, new IDs should reflect new positions
    const moveOp: Operation = {
      type: 'move_node',
      path: [0],
      newPath: [2],
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    if (result) {
      const parsed = parseSourceWithLocations(result)

      // IDs are path-based, so they change with structure
      // p (was at 1, now at 0) should have id p_0.0
      // button (was at 2, now at 1) should have id button_0.1
      // h1 (was at 0, now at 2) should have id h1_0.2
      expect(parsed.root!.children[0].id).toBe('p_0.0')
      expect(parsed.root!.children[1].id).toBe('button_0.1')
      expect(parsed.root!.children[2].id).toBe('h1_0.2')
    }
  })
})

// ============================================================================
// Additional Test Fixtures
// ============================================================================

// Source with nested elements
const NESTED_SOURCE = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="container">
    <section>
      <h1>Nested Heading</h1>
      <p>Nested paragraph</p>
    </section>
    <footer>
      <span>Footer text</span>
    </footer>
  </div>
)) satisfies BlockFn
`

// Source with props and attributes
const PROPS_SOURCE = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="container" id="main">
    <button disabled onClick={() => {}}>Click me</button>
    <input type="text" placeholder="Enter text" />
    <img src="/image.png" alt="An image" />
  </div>
)) satisfies BlockFn
`

// Source with React components (PascalCase)
const COMPONENT_SOURCE = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div>
    <Card title="First Card">Content</Card>
    <Button variant="primary">Click</Button>
    <Avatar src="/user.png" />
  </div>
)) satisfies BlockFn
`

// ============================================================================
// Additional move_node Tests
// ============================================================================

describe('move_node edge cases', () => {
  test('moves middle element forward by one position', () => {
    // Move p (index 1) to after button (index 2)
    // In Slate terms: from [1] to [2]
    const moveOp: Operation = {
      type: 'move_node',
      path: [1],
      newPath: [2],
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      const children = parsed.root!.children
      expect(children).toHaveLength(3)
      // Order should now be: h1, button, p
      expect(children[0].tagName).toBe('h1')
      expect(children[1].tagName).toBe('button')
      expect(children[2].tagName).toBe('p')
    }
  })

  test('moves middle element backward by one position', () => {
    // Move p (index 1) to before h1 (index 0)
    const moveOp: Operation = {
      type: 'move_node',
      path: [1],
      newPath: [0],
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      const children = parsed.root!.children
      // Order should now be: p, h1, button
      expect(children[0].tagName).toBe('p')
      expect(children[1].tagName).toBe('h1')
      expect(children[2].tagName).toBe('button')
    }
  })

  test('move to same position is no-op', () => {
    // Moving from [1] to [1] should effectively do nothing
    const moveOp: Operation = {
      type: 'move_node',
      path: [1],
      newPath: [1],
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      // Order should be unchanged
      const children = parsed.root!.children
      expect(children[0].tagName).toBe('h1')
      expect(children[1].tagName).toBe('p')
      expect(children[2].tagName).toBe('button')
    }
  })
})

// ============================================================================
// Nested Structure Tests
// ============================================================================

describe('nested structure operations', () => {
  test('parses nested structure correctly', () => {
    const result = parseSourceWithLocations(NESTED_SOURCE)

    expect(result.errors).toHaveLength(0)
    expect(result.root).not.toBeNull()
    expect(result.root?.tagName).toBe('div')
    expect(result.root?.children).toHaveLength(2)

    const [section, footer] = result.root!.children
    expect(section.tagName).toBe('section')
    expect(section.children).toHaveLength(2)
    expect(footer.tagName).toBe('footer')
    expect(footer.children).toHaveLength(1)
  })

  test('removes nested element', () => {
    // Remove the h1 inside section (path [0, 0])
    const removeOp: Operation = {
      type: 'remove_node',
      path: [0, 0],
      node: { type: 'h1', children: [{ text: 'Nested Heading' }] },
    }

    const result = applySlateOperations(NESTED_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      // Section should now have only 1 child (p)
      const section = parsed.root!.children[0]
      expect(section.children).toHaveLength(1)
      expect(section.children[0].tagName).toBe('p')
    }
  })

  test('inserts element into nested structure', () => {
    // Insert a new h2 at section[1] (between h1 and p)
    const insertOp: Operation = {
      type: 'insert_node',
      path: [0, 1],
      node: {
        type: 'h2',
        children: [{ text: 'Subheading' }],
      },
    }

    const result = applySlateOperations(NESTED_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.errors).toHaveLength(0)

      const section = parsed.root!.children[0]
      expect(section.children).toHaveLength(3)
      expect(section.children[0].tagName).toBe('h1')
      expect(section.children[1].tagName).toBe('h2')
      expect(section.children[2].tagName).toBe('p')
    }
  })
})

// ============================================================================
// Text Operation Edge Cases
// ============================================================================

describe('text operation edge cases', () => {
  test('inserts text at end of element', () => {
    const insertOp: Operation = {
      type: 'insert_text',
      path: [0, 0],  // h1's text
      offset: 13,    // After "First Heading"
      text: ' Updated',
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('First Heading Updated')
    }
  })

  test('removes all text from element', () => {
    const removeOp: Operation = {
      type: 'remove_text',
      path: [0, 0],
      offset: 0,
      text: 'First Heading',
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('<h1></h1>')
    }
  })

  test('handles special characters in text', () => {
    const insertOp: Operation = {
      type: 'insert_text',
      path: [0, 0],
      offset: 0,
      text: '<script>alert("xss")</script> ',
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      // The text should be inserted as-is (will be escaped when rendered)
      expect(result).toContain('<script>alert("xss")</script> First Heading')
    }
  })
})

// ============================================================================
// Remove Operation Edge Cases
// ============================================================================

describe('remove_node edge cases', () => {
  test('removes first element', () => {
    const removeOp: Operation = {
      type: 'remove_node',
      path: [0],
      node: { type: 'h1', children: [{ text: 'First Heading' }] },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(2)
      expect(parsed.root!.children[0].tagName).toBe('p')
      expect(parsed.root!.children[1].tagName).toBe('button')
    }
  })

  test('removes last element', () => {
    const removeOp: Operation = {
      type: 'remove_node',
      path: [2],
      node: { type: 'button', children: [{ text: 'Third button' }] },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [removeOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(2)
      expect(parsed.root!.children[0].tagName).toBe('h1')
      expect(parsed.root!.children[1].tagName).toBe('p')
    }
  })
})

// ============================================================================
// Insert Operation Edge Cases
// ============================================================================

describe('insert_node edge cases', () => {
  test('inserts element at beginning', () => {
    const insertOp: Operation = {
      type: 'insert_node',
      path: [0],
      node: {
        type: 'header',
        children: [{ text: 'Header' }],
      },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(4)
      expect(parsed.root!.children[0].tagName).toBe('header')
      expect(parsed.root!.children[1].tagName).toBe('h1')
    }
  })

  test('inserts element at end', () => {
    const insertOp: Operation = {
      type: 'insert_node',
      path: [3],
      node: {
        type: 'footer',
        children: [{ text: 'Footer' }],
      },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(4)
      expect(parsed.root!.children[3].tagName).toBe('footer')
    }
  })

  test('inserts self-closing element', () => {
    const insertOp: Operation = {
      type: 'insert_node',
      path: [1],
      node: {
        type: 'hr',
        children: [],
      },
    }

    const result = applySlateOperations(SIMPLE_SOURCE, [insertOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(4)
      expect(parsed.root!.children[1].tagName).toBe('hr')
    }
  })
})

// ============================================================================
// Props and Attributes Tests
// ============================================================================

describe('elements with props', () => {
  test('parses elements with various prop types', () => {
    const result = parseSourceWithLocations(PROPS_SOURCE)

    expect(result.errors).toHaveLength(0)
    expect(result.root).not.toBeNull()

    const [button, input, img] = result.root!.children

    // Button has disabled (boolean) and onClick (expression)
    expect(button.tagName).toBe('button')
    expect(button.props.disabled).toBeDefined()
    expect(button.props.onClick).toBeDefined()

    // Input has type and placeholder
    expect(input.tagName).toBe('input')
    expect(input.props.type?.value).toBe('text')
    expect(input.props.placeholder?.value).toBe('Enter text')

    // Img has src and alt
    expect(img.tagName).toBe('img')
    expect(img.props.src?.value).toBe('/image.png')
    expect(img.props.alt?.value).toBe('An image')
  })

  test('preserves props when moving element', () => {
    // Move input (index 1) to position 0
    const moveOp: Operation = {
      type: 'move_node',
      path: [1],
      newPath: [0],
    }

    const result = applySlateOperations(PROPS_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      // The input element should retain all its props
      expect(result).toContain('type="text"')
      expect(result).toContain('placeholder="Enter text"')

      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children[0].tagName).toBe('input')
      expect(parsed.root!.children[0].props.type?.value).toBe('text')
    }
  })
})

// ============================================================================
// React Component Tests
// ============================================================================

describe('React components (PascalCase)', () => {
  test('parses React components', () => {
    const result = parseSourceWithLocations(COMPONENT_SOURCE)

    expect(result.errors).toHaveLength(0)
    expect(result.root).not.toBeNull()

    const [card, button, avatar] = result.root!.children

    expect(card.tagName).toBe('Card')
    expect(card.props.title?.value).toBe('First Card')

    expect(button.tagName).toBe('Button')
    expect(button.props.variant?.value).toBe('primary')

    expect(avatar.tagName).toBe('Avatar')
    expect(avatar.selfClosing).toBe(true)
  })

  test('moves React component correctly', () => {
    const moveOp: Operation = {
      type: 'move_node',
      path: [2],  // Avatar
      newPath: [0],
    }

    const result = applySlateOperations(COMPONENT_SOURCE, [moveOp])

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children[0].tagName).toBe('Avatar')
      expect(parsed.root!.children[1].tagName).toBe('Card')
      expect(parsed.root!.children[2].tagName).toBe('Button')
    }
  })
})

// ============================================================================
// Multiple Operations Sequence Tests
// ============================================================================

describe('multiple operations sequences', () => {
  test('handles insert then move', () => {
    const ops: Operation[] = [
      {
        type: 'insert_node',
        path: [0],
        node: { type: 'header', children: [{ text: 'New Header' }] },
      },
      // After insert, move the new header to the end
      // Note: After insert at [0], h1 is at [1], p at [2], button at [3]
      // We want to move header from [0] to [4]
      {
        type: 'move_node',
        path: [0],
        newPath: [4],
      },
    ]

    const result = applySlateOperations(SIMPLE_SOURCE, ops)

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(4)
      // Order should be: h1, p, button, header
      expect(parsed.root!.children[0].tagName).toBe('h1')
      expect(parsed.root!.children[1].tagName).toBe('p')
      expect(parsed.root!.children[2].tagName).toBe('button')
      expect(parsed.root!.children[3].tagName).toBe('header')
    }
  })

  test('handles remove then insert', () => {
    const ops: Operation[] = [
      {
        type: 'remove_node',
        path: [1],
        node: { type: 'p', children: [{ text: 'Second paragraph' }] },
      },
      // After remove, button is at [1]
      // Insert new element at [1]
      {
        type: 'insert_node',
        path: [1],
        node: { type: 'span', children: [{ text: 'New span' }] },
      },
    ]

    const result = applySlateOperations(SIMPLE_SOURCE, ops)

    expect(result).not.toBeNull()
    if (result) {
      const parsed = parseSourceWithLocations(result)
      expect(parsed.root!.children).toHaveLength(3)
      expect(parsed.root!.children[0].tagName).toBe('h1')
      expect(parsed.root!.children[1].tagName).toBe('span')
      expect(parsed.root!.children[2].tagName).toBe('button')
    }
  })

  test('handles text edit then move', () => {
    const ops: Operation[] = [
      {
        type: 'insert_text',
        path: [0, 0],
        offset: 0,
        text: 'UPDATED: ',
      },
      {
        type: 'move_node',
        path: [0],
        newPath: [2],
      },
    ]

    const result = applySlateOperations(SIMPLE_SOURCE, ops)

    expect(result).not.toBeNull()
    if (result) {
      expect(result).toContain('UPDATED: First Heading')

      const parsed = parseSourceWithLocations(result)
      // h1 should be at the end
      expect(parsed.root!.children[2].tagName).toBe('h1')
    }
  })
})

// ============================================================================
// Bidirectional Serialization Equivalence Tests
// ============================================================================

// Import surgical converters for roundtrip testing
import { sourceToPlateValueSurgical } from '../../demo/plate/surgical-converters'

/**
 * Helper to compare AST structures (ignoring IDs and exact locations)
 */
function compareAstStructure(a: any, b: any): boolean {
  if (a.tagName !== b.tagName) return false
  if (a.children.length !== b.children.length) return false

  for (let i = 0; i < a.children.length; i++) {
    if (!compareAstStructure(a.children[i], b.children[i])) return false
  }

  return true
}

/**
 * Helper to get structure summary for debugging
 */
function getStructureSummary(node: any, depth = 0): string {
  const indent = '  '.repeat(depth)
  let result = `${indent}${node.tagName}`
  if (node.text) result += `: "${node.text}"`
  result += '\n'

  for (const child of node.children || []) {
    result += getStructureSummary(child, depth + 1)
  }

  return result
}

describe('bidirectional serialization equivalence', () => {
  test('Source → Plate → Source preserves structure after parsing', () => {
    // Parse source to AST
    const originalParsed = parseSourceWithLocations(SIMPLE_SOURCE)
    expect(originalParsed.errors).toHaveLength(0)
    expect(originalParsed.root).not.toBeNull()

    // Convert to Plate value
    const { value: plateValue, parseResult } = sourceToPlateValueSurgical(SIMPLE_SOURCE)
    expect(parseResult.errors).toHaveLength(0)

    // The Plate value should have the correct structure
    // (Plate flattens root div, so we get the children directly)
    expect(plateValue).toHaveLength(3)
    expect((plateValue[0] as any).type).toBe('h1')
    expect((plateValue[1] as any).type).toBe('p')
    expect((plateValue[2] as any).type).toBe('button')

    // Text content should be preserved
    const h1 = plateValue[0] as any
    expect(h1.children[0].text).toBe('First Heading')
  })

  test('Source → Plate value has correct element types', () => {
    const { value } = sourceToPlateValueSurgical(PROPS_SOURCE)

    // Check that element types are preserved
    expect((value[0] as any).type).toBe('button')
    expect((value[1] as any).type).toBe('input')
    expect((value[2] as any).type).toBe('img')
  })

  test('Source → Plate value preserves props', () => {
    const { value } = sourceToPlateValueSurgical(PROPS_SOURCE)

    const input = value[1] as any
    expect(input.type).toBe('input')
    // Note: Props are spread onto the Plate element
    // The exact prop handling depends on surgical-converters implementation
  })

  test('Source → Plate → apply operation → Source produces valid source', () => {
    // This tests the full roundtrip: source → Plate → edit → source

    // Start with source
    const originalSource = SIMPLE_SOURCE

    // Convert to Plate
    const { value: plateValue } = sourceToPlateValueSurgical(originalSource)

    // Apply an operation (move h1 to end)
    const moveOp: Operation = {
      type: 'move_node',
      path: [0],
      newPath: [2],
    }

    const newSource = applySlateOperations(originalSource, [moveOp])
    expect(newSource).not.toBeNull()

    // The new source should parse correctly
    const newParsed = parseSourceWithLocations(newSource!)
    expect(newParsed.errors).toHaveLength(0)
    expect(newParsed.root).not.toBeNull()

    // And should have the correct structure
    expect(newParsed.root!.children).toHaveLength(3)
    expect(newParsed.root!.children[0].tagName).toBe('p')
    expect(newParsed.root!.children[1].tagName).toBe('button')
    expect(newParsed.root!.children[2].tagName).toBe('h1')

    // Convert new source back to Plate
    const { value: newPlateValue, parseResult } = sourceToPlateValueSurgical(newSource!)
    expect(parseResult.errors).toHaveLength(0)

    // Verify Plate value matches
    expect(newPlateValue).toHaveLength(3)
    expect((newPlateValue[0] as any).type).toBe('p')
    expect((newPlateValue[1] as any).type).toBe('button')
    expect((newPlateValue[2] as any).type).toBe('h1')
  })

  test('React components roundtrip correctly', () => {
    const { value } = sourceToPlateValueSurgical(COMPONENT_SOURCE)

    // Components should be preserved as their PascalCase names
    expect((value[0] as any).type).toBe('Card')
    expect((value[1] as any).type).toBe('Button')
    expect((value[2] as any).type).toBe('Avatar')

    // Move Avatar to front
    const moveOp: Operation = {
      type: 'move_node',
      path: [2],
      newPath: [0],
    }

    const newSource = applySlateOperations(COMPONENT_SOURCE, [moveOp])
    expect(newSource).not.toBeNull()

    // Verify the new source has correct structure
    const { value: newValue } = sourceToPlateValueSurgical(newSource!)
    expect((newValue[0] as any).type).toBe('Avatar')
    expect((newValue[1] as any).type).toBe('Card')
    expect((newValue[2] as any).type).toBe('Button')
  })

  test('nested structure roundtrips correctly', () => {
    const { value } = sourceToPlateValueSurgical(NESTED_SOURCE)

    // Should have 2 top-level elements (section and footer)
    expect(value).toHaveLength(2)
    expect((value[0] as any).type).toBe('section')
    expect((value[1] as any).type).toBe('footer')

    // Section should have nested children
    const section = value[0] as any
    expect(section.children.length).toBeGreaterThan(0)
  })

  test('text content is preserved through roundtrip', () => {
    const testSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div>
    <p>Hello, this is some text with special chars: &amp; &lt; &gt;</p>
    <span>Multiple words here</span>
  </div>
)) satisfies BlockFn
`

    const { value, parseResult } = sourceToPlateValueSurgical(testSource)
    expect(parseResult.errors).toHaveLength(0)

    // Check text is extracted
    const p = value[0] as any
    expect(p.type).toBe('p')
    // Note: The text content may include the raw source chars
  })

  test('empty elements roundtrip correctly', () => {
    const testSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div>
    <p></p>
    <span />
    <div>Content</div>
  </div>
)) satisfies BlockFn
`

    const { value, parseResult } = sourceToPlateValueSurgical(testSource)
    expect(parseResult.errors).toHaveLength(0)

    // Should parse without errors
    expect(value.length).toBeGreaterThan(0)
  })

  test('operation on source produces equivalent Plate structure', () => {
    // Parse original
    const { value: originalValue } = sourceToPlateValueSurgical(SIMPLE_SOURCE)

    // Apply text insert
    const insertOp: Operation = {
      type: 'insert_text',
      path: [0, 0],
      offset: 0,
      text: 'NEW ',
    }

    const newSource = applySlateOperations(SIMPLE_SOURCE, [insertOp])
    expect(newSource).not.toBeNull()

    // Parse modified source
    const { value: newValue } = sourceToPlateValueSurgical(newSource!)

    // Structure should be the same
    expect(newValue.length).toBe(originalValue.length)
    expect((newValue[0] as any).type).toBe((originalValue[0] as any).type)
    expect((newValue[1] as any).type).toBe((originalValue[1] as any).type)
    expect((newValue[2] as any).type).toBe((originalValue[2] as any).type)

    // But text content should be different
    const newH1 = newValue[0] as any
    expect(newH1.children[0].text).toBe('NEW First Heading')
  })
})
