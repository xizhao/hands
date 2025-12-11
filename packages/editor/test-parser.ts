import { parseSourceWithLocations } from './src/ast/babel-parser'

const source = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="p-4">
    <h1>Hello World</h1>
    <p>This is a simple block with some content.</p>
    <button variant="primary">Click Me</button>
  </div>
)) satisfies BlockFn
`

const result = parseSourceWithLocations(source)
console.log('Parse result:')
console.log(JSON.stringify(result, null, 2))
