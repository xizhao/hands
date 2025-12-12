import { describe, it, expect } from 'bun:test'
import { extractDataDependencies, getDataDependencySummary } from '../sql-extractor'

describe('sql-extractor', () => {
  it('extracts SELECT query tables and columns', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const users = await ctx.db.sql\`SELECT id, name, email FROM users WHERE active = \${true}\`
        return <div>{users.map(u => <span>{u.name}</span>)}</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(1)
    expect(deps.queries[0].type).toBe('select')
    expect(deps.queries[0].tables).toContain('users')
    expect(deps.queries[0].assignedTo).toBe('users')
    expect(deps.allTables).toContain('users')
  })

  it('extracts INSERT query', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        await ctx.db.sql\`INSERT INTO orders (user_id, total) VALUES (\${userId}, \${amount})\`
        return <div>Done</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(1)
    expect(deps.queries[0].type).toBe('insert')
    expect(deps.queries[0].tables).toContain('orders')
  })

  it('extracts multiple queries', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const users = await ctx.db.sql\`SELECT * FROM users\`
        const orders = await ctx.db.sql\`SELECT * FROM orders WHERE user_id IN (SELECT id FROM users)\`
        return <div>{users.length} users, {orders.length} orders</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(2)
    expect(deps.allTables).toContain('users')
    expect(deps.allTables).toContain('orders')
  })

  it('extracts JOIN queries', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const data = await ctx.db.sql\`
          SELECT u.name, o.total
          FROM users u
          JOIN orders o ON o.user_id = u.id
          WHERE o.status = 'complete'
        \`
        return <div>{data.length}</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(1)
    expect(deps.allTables).toContain('users')
    expect(deps.allTables).toContain('orders')
  })

  it('tracks variable bindings to JSX usage', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const users = await ctx.db.sql\`SELECT name FROM users\`
        return <ul>{users.map(u => <li>{u.name}</li>)}</ul>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    // Find the binding for 'users' variable
    const usersBinding = deps.bindings.find(b => b.variable === 'users')
    expect(usersBinding).toBeDefined()
    expect(usersBinding!.usages.length).toBeGreaterThan(0)
  })

  it('generates summary', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const users = await ctx.db.sql\`SELECT * FROM users\`
        await ctx.db.sql\`INSERT INTO logs (action) VALUES ('viewed')\`
        return <div>{users.length}</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)
    const summary = getDataDependencySummary(deps)

    expect(summary).toContain('Tables:')
    expect(summary).toContain('users')
    expect(summary).toContain('logs')
    expect(summary).toContain('1 SELECT')
    expect(summary).toContain('1 write')
  })

  it('handles CREATE TABLE', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        await ctx.db.sql\`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL
          )
        \`
        return <div>Created</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(1)
    expect(deps.queries[0].type).toBe('create')
  })

  it('handles no queries', () => {
    const source = `
      const MyBlock = () => {
        return <div>Hello</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(0)
    expect(getDataDependencySummary(deps)).toBe('No database queries')
  })

  it('extracts ctx.sql direct pattern (without .db)', () => {
    const source = `
      const MyBlock = async ({ ctx }) => {
        const rows = await ctx.sql\`SELECT email, count FROM users ORDER BY count DESC\`
        return <div>{rows.map(r => <span>{r.email}</span>)}</div>
      }
      export default MyBlock
    `

    const deps = extractDataDependencies(source)

    expect(deps.queries).toHaveLength(1)
    expect(deps.queries[0].type).toBe('select')
    expect(deps.queries[0].tables).toContain('users')
    expect(deps.queries[0].assignedTo).toBe('rows')
    expect(deps.allTables).toContain('users')
  })
})
