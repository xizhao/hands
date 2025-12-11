import { parse } from '@babel/parser'

const source = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="p-4">
    <h1>Hello World</h1>
  </div>
)) satisfies BlockFn
`

const ast = parse(source, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
})

// Find export default
for (const stmt of ast.program.body) {
  if (stmt.type === 'ExportDefaultDeclaration') {
    console.log('Export default declaration type:', stmt.declaration.type)
    if (stmt.declaration.type === 'TSSatisfiesExpression') {
      console.log('Inner expression type:', stmt.declaration.expression.type)
      const expr = stmt.declaration.expression
      if (expr.type === 'ParenthesizedExpression') {
        console.log('Parenthesized inner type:', expr.expression.type)
        const inner = expr.expression
        if (inner.type === 'ArrowFunctionExpression') {
          console.log('Arrow body type:', inner.body.type)
        }
      }
    }
  }
}
