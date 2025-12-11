import { sourceToPlateValueSurgical } from './demo/plate/surgical-converters'

const source = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="p-4">
    <h1>Hello World</h1>
    <p>This is a simple block with some content.</p>
    <button variant="primary">Click Me</button>
  </div>
)) satisfies BlockFn
`

const { value, parseResult } = sourceToPlateValueSurgical(source)

console.log('Parse errors:', parseResult.errors)
console.log('Root exists:', !!parseResult.root)
console.log('\nPlate value:')
console.log(JSON.stringify(value, null, 2))
