/**
 * RSC Editor Operations Tests
 *
 * Tests for the high-level edit operations that map to surgical mutations.
 */

import { describe, test, expect } from 'bun:test'
import { applyOperation, applyOperations, type EditOperation } from '../overlay/operations'

// ============================================================================
// Test Fixtures
// ============================================================================

const simpleBlockSource = `
export default function Simple() {
  return (
    <div className="container">
      <h1>Title</h1>
      <p>First paragraph</p>
      <p>Second paragraph</p>
    </div>
  )
}
`.trim()

const nestedBlockSource = `
export default function Nested() {
  return (
    <div className="outer">
      <div className="inner">
        <p>Nested text</p>
      </div>
      <span>Sibling</span>
    </div>
  )
}
`.trim()

// ============================================================================
// Move Operation Tests
// ============================================================================

describe('move operation', () => {
  test('moves element after sibling', () => {
    const operation: EditOperation = {
      type: 'move',
      nodeId: 'h1_0.0',
      targetId: 'p_0.2',
      position: 'after',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    // h1 should now be after the second p
    expect(result.newSource!.indexOf('<p>Second paragraph</p>')).toBeLessThan(
      result.newSource!.indexOf('<h1>Title</h1>')
    )
  })

  test('moves element before sibling', () => {
    const operation: EditOperation = {
      type: 'move',
      nodeId: 'p_0.2',
      targetId: 'h1_0.0',
      position: 'before',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    // Second p should now be before h1
    expect(result.newSource!.indexOf('<p>Second paragraph</p>')).toBeLessThan(
      result.newSource!.indexOf('<h1>Title</h1>')
    )
  })

  test('fails for non-existent source node', () => {
    const operation: EditOperation = {
      type: 'move',
      nodeId: 'nonexistent_0',
      targetId: 'p_0.1',
      position: 'after',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  test('fails for non-existent target node', () => {
    const operation: EditOperation = {
      type: 'move',
      nodeId: 'h1_0.0',
      targetId: 'nonexistent_0',
      position: 'after',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

// ============================================================================
// Delete Operation Tests
// ============================================================================

describe('delete operation', () => {
  test('deletes an element', () => {
    const operation: EditOperation = {
      type: 'delete',
      nodeId: 'h1_0.0',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).not.toContain('<h1>Title</h1>')
  })

  test('deletes nested element', () => {
    const operation: EditOperation = {
      type: 'delete',
      nodeId: 'p_0.0.0',
    }

    const result = applyOperation(nestedBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).not.toContain('<p>Nested text</p>')
  })

  test('fails for non-existent node', () => {
    const operation: EditOperation = {
      type: 'delete',
      nodeId: 'nonexistent_0',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

// ============================================================================
// Set Text Operation Tests
// ============================================================================

describe('set-text operation', () => {
  test('changes text content', () => {
    const operation: EditOperation = {
      type: 'set-text',
      nodeId: 'h1_0.0',
      text: 'New Title',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('New Title')
    expect(result.newSource).not.toContain('>Title<')
  })

  test('handles empty text', () => {
    const operation: EditOperation = {
      type: 'set-text',
      nodeId: 'p_0.1',
      text: '',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).not.toContain('First paragraph')
  })

  test('handles special characters', () => {
    const operation: EditOperation = {
      type: 'set-text',
      nodeId: 'h1_0.0',
      text: 'Title with <special> & "chars"',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('Title with <special> & "chars"')
  })
})

// ============================================================================
// Set Prop Operation Tests
// ============================================================================

describe('set-prop operation', () => {
  test('changes existing prop', () => {
    const operation: EditOperation = {
      type: 'set-prop',
      nodeId: 'div_0',
      propName: 'className',
      value: 'new-class',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('className="new-class"')
    expect(result.newSource).not.toContain('className="container"')
  })

  test('adds new prop', () => {
    const operation: EditOperation = {
      type: 'set-prop',
      nodeId: 'h1_0.0',
      propName: 'id',
      value: 'main-title',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('id="main-title"')
  })

  test('handles boolean prop true', () => {
    const operation: EditOperation = {
      type: 'set-prop',
      nodeId: 'h1_0.0',
      propName: 'hidden',
      value: true,
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    // Boolean true can be just the prop name
    expect(result.newSource).toMatch(/<h1[^>]*hidden/)
  })

  test('handles number prop', () => {
    const operation: EditOperation = {
      type: 'set-prop',
      nodeId: 'h1_0.0',
      propName: 'tabIndex',
      value: 0,
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('tabIndex={0}')
  })
})

// ============================================================================
// Delete Prop Operation Tests
// ============================================================================

describe('delete-prop operation', () => {
  test('removes existing prop', () => {
    const operation: EditOperation = {
      type: 'delete-prop',
      nodeId: 'div_0',
      propName: 'className',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).not.toContain('className="container"')
  })

  test('succeeds even if prop does not exist', () => {
    const operation: EditOperation = {
      type: 'delete-prop',
      nodeId: 'h1_0.0',
      propName: 'nonexistent',
    }

    const result = applyOperation(simpleBlockSource, operation)

    // Should succeed (no-op)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// Duplicate Operation Tests
// ============================================================================

describe('duplicate operation', () => {
  test('duplicates an element', () => {
    const operation: EditOperation = {
      type: 'duplicate',
      nodeId: 'h1_0.0',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    // Should have two h1 elements now
    const h1Count = (result.newSource!.match(/<h1>/g) || []).length
    expect(h1Count).toBe(2)
  })
})

// ============================================================================
// Insert Operation Tests
// ============================================================================

describe('insert operation', () => {
  test('inserts new element', () => {
    const operation: EditOperation = {
      type: 'insert',
      parentId: 'div_0',
      index: 1,
      jsx: '<p>Inserted paragraph</p>',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('<p>Inserted paragraph</p>')
  })
})

// ============================================================================
// Replace Operation Tests
// ============================================================================

describe('replace operation', () => {
  test('replaces element with new JSX', () => {
    const operation: EditOperation = {
      type: 'replace',
      nodeId: 'h1_0.0',
      jsx: '<h2>New Heading</h2>',
    }

    const result = applyOperation(simpleBlockSource, operation)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('<h2>New Heading</h2>')
    expect(result.newSource).not.toContain('<h1>Title</h1>')
  })
})

// ============================================================================
// Batch Operations Tests
// ============================================================================

describe('batch operations', () => {
  test('applies multiple operations in sequence', () => {
    const operations: EditOperation[] = [
      { type: 'set-text', nodeId: 'h1_0.0', text: 'Updated Title' },
      { type: 'delete', nodeId: 'p_0.2' },
    ]

    const result = applyOperations(simpleBlockSource, operations)

    expect(result.success).toBe(true)
    expect(result.newSource).toBeDefined()
    expect(result.newSource).toContain('Updated Title')
    expect(result.newSource).not.toContain('Second paragraph')
  })

  test('stops on first failure', () => {
    const operations: EditOperation[] = [
      { type: 'set-text', nodeId: 'h1_0.0', text: 'Updated Title' },
      { type: 'delete', nodeId: 'nonexistent_0' },
      { type: 'set-text', nodeId: 'p_0.1', text: 'Should not happen' },
    ]

    const result = applyOperations(simpleBlockSource, operations)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})
