/**
 * Block Generator - Generate .tsx source from BlockModel using recast
 *
 * Uses recast to preserve formatting and comments when modifying existing code.
 * For new files, generates clean formatted code.
 */

import * as recast from "recast"
import type {
  BlockModel,
  JsxNode,
  PropValue,
  SqlQuery,
  ImportDeclaration,
} from "../model/block-model"

// TypeScript parser for recast
const tsParser = {
  parse(source: string) {
    // Use recast's built-in TypeScript support via babel parser
    return recast.parse(source, {
      parser: {
        parse(source: string) {
          // Dynamic import to avoid bundling issues
          const babelParser = require("@babel/parser")
          return babelParser.parse(source, {
            sourceType: "module",
            plugins: ["typescript", "jsx"],
          })
        },
      },
    })
  },
}

const b = recast.types.builders

/**
 * Block code generator
 */
export class BlockGenerator {
  /**
   * Generate source code from a BlockModel
   *
   * If originalSource is provided, patches only the changed parts.
   * Otherwise, generates a fresh block file.
   */
  async generateSource(model: BlockModel, originalSource?: string): Promise<string> {
    if (originalSource) {
      return this.patchSource(model, originalSource)
    }
    return this.generateFreshSource(model)
  }

  /**
   * Patch existing source with changes from the model
   */
  private patchSource(model: BlockModel, originalSource: string): string {
    const ast = tsParser.parse(originalSource)

    // Patch the JSX return
    this.patchJsxReturn(ast, model.root)

    // Patch metadata
    this.patchMeta(ast, model.meta)

    // Patch SQL queries
    // (More complex - may need to update variable names, template literals)
    // For now, we preserve original queries

    return recast.print(ast).code
  }

  /**
   * Patch the JSX in the return statement
   */
  private patchJsxReturn(ast: recast.types.ASTNode, newRoot: JsxNode): void {
    // Find the default export function
    recast.visit(ast, {
      visitExportDefaultDeclaration(path) {
        const decl = path.node.declaration

        // Handle direct function
        if (decl.type === "FunctionDeclaration" || decl.type === "ArrowFunctionExpression") {
          patchFunctionReturn(decl, newRoot)
        }

        return false
      },

      visitExportNamedDeclaration(path) {
        // Handle: const Foo = ...; export default Foo
        return this.traverse(path)
      },
    })

    function patchFunctionReturn(
      func: recast.types.namedTypes.FunctionDeclaration | recast.types.namedTypes.ArrowFunctionExpression,
      root: JsxNode
    ) {
      // For arrow functions with expression body
      if (func.type === "ArrowFunctionExpression" && func.body.type !== "BlockStatement") {
        func.body = jsxNodeToAst(root) as recast.types.namedTypes.Expression
        return
      }

      // For block body - find return statement
      const body = func.body
      if (body.type !== "BlockStatement") return

      for (const stmt of body.body) {
        if (stmt.type === "ReturnStatement" && stmt.argument) {
          stmt.argument = jsxNodeToAst(root) as recast.types.namedTypes.Expression
          break
        }
      }
    }
  }

  /**
   * Patch metadata export
   */
  private patchMeta(
    ast: recast.types.ASTNode,
    meta: { title?: string; description?: string; refreshable?: boolean }
  ): void {
    recast.visit(ast, {
      visitVariableDeclaration(path) {
        const decl = path.node.declarations[0]
        if (
          decl.type === "VariableDeclarator" &&
          decl.id.type === "Identifier" &&
          decl.id.name === "meta"
        ) {
          // Rebuild the meta object
          const props: recast.types.namedTypes.ObjectProperty[] = []

          if (meta.title) {
            props.push(
              b.objectProperty(b.identifier("title"), b.stringLiteral(meta.title))
            )
          }
          if (meta.description) {
            props.push(
              b.objectProperty(b.identifier("description"), b.stringLiteral(meta.description))
            )
          }
          if (meta.refreshable !== undefined) {
            props.push(
              b.objectProperty(
                b.identifier("refreshable"),
                b.booleanLiteral(meta.refreshable)
              )
            )
          }

          decl.init = b.objectExpression(props)
        }
        return this.traverse(path)
      },
    })
  }

  /**
   * Generate fresh source code for a new block
   */
  private generateFreshSource(model: BlockModel): string {
    const lines: string[] = []

    // Imports
    lines.push('import type { BlockFn, BlockMeta } from "@hands/stdlib"')

    for (const imp of model.imports) {
      if (imp.moduleSpecifier === "@hands/stdlib") continue // Already added
      lines.push(this.generateImport(imp))
    }

    lines.push("")

    // Type definitions for props if needed
    if (Object.keys(model.signature.propsType.properties).length > 0) {
      lines.push(this.generatePropsType(model))
      lines.push("")
    }

    // Main function
    lines.push(this.generateFunction(model))
    lines.push("")

    // Export default
    if (model.signature.functionName) {
      lines.push(`export default ${model.signature.functionName}`)
    }

    // Metadata
    if (model.meta.title || model.meta.description || model.meta.refreshable !== undefined) {
      lines.push("")
      lines.push(this.generateMeta(model.meta))
    }

    return lines.join("\n")
  }

  /**
   * Generate import statement
   */
  private generateImport(imp: ImportDeclaration): string {
    const parts: string[] = []

    if (imp.defaultImport) {
      parts.push(imp.defaultImport)
    }

    if (imp.namedImports && imp.namedImports.length > 0) {
      const named = imp.namedImports
        .map((n) => (n.alias ? `${n.name} as ${n.alias}` : n.name))
        .join(", ")
      parts.push(`{ ${named} }`)
    }

    if (imp.namespaceImport) {
      parts.push(`* as ${imp.namespaceImport}`)
    }

    const typePrefix = imp.isTypeOnly ? "import type" : "import"
    return `${typePrefix} ${parts.join(", ")} from "${imp.moduleSpecifier}"`
  }

  /**
   * Generate props type definition
   */
  private generatePropsType(model: BlockModel): string {
    const props = model.signature.propsType.properties
    const required = new Set(model.signature.propsType.required)

    const propLines = Object.entries(props).map(([name, def]) => {
      const opt = required.has(name) ? "" : "?"
      const type = this.defToTypeString(def)
      const comment = def.description ? `  /** ${def.description} */\n` : ""
      return `${comment}  ${name}${opt}: ${type}`
    })

    const typeName = model.signature.functionName
      ? `${model.signature.functionName}Props`
      : "Props"

    return `interface ${typeName} {\n${propLines.join("\n")}\n}`
  }

  /**
   * Convert PropDefinition to TypeScript type string
   */
  private defToTypeString(def: { type: string; literalOptions?: (string | number | boolean)[] }): string {
    if (def.literalOptions) {
      return def.literalOptions.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ")
    }

    switch (def.type) {
      case "string":
        return "string"
      case "number":
        return "number"
      case "boolean":
        return "boolean"
      case "object":
        return "Record<string, unknown>"
      case "array":
        return "unknown[]"
      default:
        return "unknown"
    }
  }

  /**
   * Generate the main block function
   */
  private generateFunction(model: BlockModel): string {
    const funcName = model.signature.functionName ?? "Block"
    const asyncKeyword = model.signature.isAsync ? "async " : ""

    // Build parameter destructuring
    const propNames = Object.keys(model.signature.propsType.properties)
    const paramParts = ["ctx", ...propNames]
    const params = `{ ${paramParts.join(", ")} }`

    // Generate props type reference
    const hasCustomProps = propNames.length > 0
    const propsType = hasCustomProps ? `${funcName}Props` : "unknown"

    // Generate queries
    const queryLines = model.queries.map((q) => this.generateQuery(q))

    // Generate JSX
    const jsx = this.generateJsx(model.root)

    const body = [...queryLines, `return ${jsx}`].join("\n  ")

    return `const ${funcName}: BlockFn<${propsType}> = ${asyncKeyword}(${params}) => {\n  ${body}\n}`
  }

  /**
   * Generate SQL query
   */
  private generateQuery(query: SqlQuery): string {
    const typeAnnotation = query.resultType ? `<${query.resultType}>` : ""

    // Rebuild template literal with interpolations
    let template = query.templateLiteral
    if (query.interpolations) {
      // Replace placeholders with expressions
      for (const interp of query.interpolations) {
        template = template.replace(`$${interp.index + 1}`, `\${${interp.expression}}`)
      }
    }

    return `const ${query.variableName} = await ctx.sql${typeAnnotation}\`${template}\``
  }

  /**
   * Generate JSX from JsxNode
   */
  private generateJsx(node: JsxNode, indent = 0): string {
    const pad = "  ".repeat(indent)

    switch (node.type) {
      case "text":
        return node.text ?? ""

      case "expression":
        return `{${node.expression}}`

      case "fragment": {
        if (!node.children || node.children.length === 0) {
          return "<></>"
        }
        const children = node.children.map((c) => this.generateJsx(c, indent + 1)).join("\n")
        return `<>\n${children}\n${pad}</>`
      }

      case "element": {
        const tagName = node.tagName ?? "div"
        const propsStr = this.generateProps(node.props ?? {})

        if (!node.children || node.children.length === 0) {
          return `<${tagName}${propsStr} />`
        }

        const children = node.children.map((c) => this.generateJsx(c, indent + 1)).join("\n")

        // Single-line for simple text children
        if (node.children.length === 1 && node.children[0].type === "text") {
          return `<${tagName}${propsStr}>${node.children[0].text}</${tagName}>`
        }

        return `<${tagName}${propsStr}>\n${children}\n${pad}</${tagName}>`
      }

      default:
        return ""
    }
  }

  /**
   * Generate JSX props string
   */
  private generateProps(props: Record<string, PropValue>): string {
    const entries = Object.entries(props)
    if (entries.length === 0) return ""

    const parts = entries.map(([name, value]) => {
      // Handle spread
      if (name === "...spread") {
        return `{...${value.value}}`
      }

      // Boolean true shorthand
      if (value.type === "literal" && value.value === true) {
        return name
      }

      // String literal
      if (value.type === "literal" && typeof value.value === "string") {
        return `${name}="${value.value}"`
      }

      // Number/boolean literals
      if (value.type === "literal") {
        return `${name}={${JSON.stringify(value.value)}}`
      }

      // Expression
      return `${name}={${value.rawSource ?? value.value}}`
    })

    return " " + parts.join(" ")
  }

  /**
   * Generate metadata export
   */
  private generateMeta(meta: { title?: string; description?: string; refreshable?: boolean }): string {
    const props: string[] = []

    if (meta.title) {
      props.push(`  title: "${meta.title}"`)
    }
    if (meta.description) {
      props.push(`  description: "${meta.description}"`)
    }
    if (meta.refreshable !== undefined) {
      props.push(`  refreshable: ${meta.refreshable}`)
    }

    return `export const meta: BlockMeta = {\n${props.join(",\n")}\n}`
  }
}

/**
 * Convert JsxNode to recast AST node
 */
function jsxNodeToAst(node: JsxNode): recast.types.namedTypes.JSXElement | recast.types.namedTypes.JSXFragment | recast.types.namedTypes.JSXText | recast.types.namedTypes.JSXExpressionContainer {
  switch (node.type) {
    case "text":
      return b.jsxText(node.text ?? "")

    case "expression":
      return b.jsxExpressionContainer(b.identifier(node.expression ?? "null"))

    case "fragment": {
      const children = (node.children ?? []).map(jsxNodeToAst)
      return b.jsxFragment(b.jsxOpeningFragment(), b.jsxClosingFragment(), children)
    }

    case "element": {
      const tagName = node.tagName ?? "div"
      const isComponent = tagName[0] === tagName[0].toUpperCase()
      const name = isComponent ? b.jsxIdentifier(tagName) : b.jsxIdentifier(tagName)

      const attrs = Object.entries(node.props ?? {}).map(([key, value]) => {
        if (key === "...spread") {
          return b.jsxSpreadAttribute(b.identifier(String(value.value)))
        }

        const attrValue =
          value.type === "literal" && typeof value.value === "string"
            ? b.stringLiteral(value.value)
            : b.jsxExpressionContainer(
                value.type === "literal"
                  ? b.literal(value.value as string | number | boolean | null)
                  : b.identifier(String(value.rawSource ?? value.value))
              )

        return b.jsxAttribute(b.jsxIdentifier(key), attrValue)
      })

      const children = (node.children ?? []).map(jsxNodeToAst)

      if (children.length === 0) {
        return b.jsxElement(
          b.jsxOpeningElement(name, attrs, true),
          null,
          []
        )
      }

      return b.jsxElement(
        b.jsxOpeningElement(name, attrs, false),
        b.jsxClosingElement(name),
        children
      )
    }

    default:
      return b.jsxText("")
  }
}

/**
 * Singleton generator instance
 */
let generatorInstance: BlockGenerator | null = null

/**
 * Get the shared generator instance
 */
export function getGenerator(): BlockGenerator {
  if (!generatorInstance) {
    generatorInstance = new BlockGenerator()
  }
  return generatorInstance
}

/**
 * Generate source code from a BlockModel
 */
export async function generateSource(
  model: BlockModel,
  originalSource?: string
): Promise<string> {
  return getGenerator().generateSource(model, originalSource)
}
