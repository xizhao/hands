/**
 * Block Parser - Parse .tsx files into BlockModel using ts-morph
 *
 * Uses the TypeScript Compiler API (via ts-morph) for full type-aware parsing.
 * This gives us access to type information from generics like BlockFn<TProps>.
 */

import {
  Project,
  SourceFile,
  SyntaxKind,
  Node,
  FunctionDeclaration,
  VariableDeclaration,
  ArrowFunction,
  FunctionExpression,
  JsxElement,
  JsxSelfClosingElement,
  JsxFragment,
  JsxText,
  JsxExpression,
  JsxAttribute,
  JsxSpreadAttribute,
  CallExpression,
  TaggedTemplateExpression,
  TypeChecker,
  Type,
  Symbol as TsSymbol,
} from "ts-morph"
import type { BlockMeta } from "@hands/stdlib"
import type {
  BlockModel,
  BlockSignature,
  JsxNode,
  PropValue,
  PropSchema,
  PropDefinition,
  SqlQuery,
  ImportDeclaration,
} from "../model/block-model"
import { createHash } from "crypto"

/**
 * Block parser using ts-morph for TypeScript-aware parsing
 */
export class BlockParser {
  private project: Project

  constructor() {
    this.project = new Project({
      compilerOptions: {
        jsx: SyntaxKind.JsxText as unknown as undefined, // JsxReact
        esModuleInterop: true,
        strict: true,
        target: SyntaxKind.Unknown as unknown as undefined, // ES2022
        module: SyntaxKind.Unknown as unknown as undefined, // ESNext
      },
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    })
  }

  /**
   * Parse a block file into a BlockModel
   */
  async parseBlock(filePath: string, source: string): Promise<BlockModel> {
    const parseErrors: string[] = []

    // Create or update the source file in the in-memory project
    let sourceFile = this.project.getSourceFile(filePath)
    if (sourceFile) {
      sourceFile.replaceWithText(source)
    } else {
      sourceFile = this.project.createSourceFile(filePath, source, { overwrite: true })
    }

    // Extract block ID from filename
    const id = this.extractBlockId(filePath)

    // Extract imports
    const imports = this.extractImports(sourceFile)

    // Extract metadata from `export const meta`
    const meta = this.extractMeta(sourceFile)

    // Find the default export function
    const defaultExport = this.findDefaultExport(sourceFile)
    if (!defaultExport) {
      parseErrors.push("Missing default export function")
    }

    // Extract function signature (props type, async, etc.)
    const signature = defaultExport
      ? this.extractSignature(sourceFile, defaultExport)
      : this.createEmptySignature()

    // Extract the JSX return tree
    const root = defaultExport
      ? this.extractJsxTree(defaultExport, parseErrors)
      : this.createEmptyRoot()

    // Extract SQL queries from ctx.sql calls
    const queries = defaultExport ? this.extractSqlQueries(defaultExport) : []

    return {
      id,
      filePath,
      meta: meta ?? {},
      signature,
      root,
      queries,
      imports,
      sourceHash: this.hashSource(source),
      lastModified: Date.now(),
      parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    }
  }

  /**
   * Extract block ID from file path
   */
  private extractBlockId(filePath: string): string {
    const filename = filePath.split("/").pop() ?? ""
    return filename.replace(/\.(tsx?|jsx?)$/, "")
  }

  /**
   * Extract import declarations
   */
  private extractImports(sourceFile: SourceFile): ImportDeclaration[] {
    return sourceFile.getImportDeclarations().map((decl) => {
      const result: ImportDeclaration = {
        moduleSpecifier: decl.getModuleSpecifierValue(),
      }

      const defaultImport = decl.getDefaultImport()
      if (defaultImport) {
        result.defaultImport = defaultImport.getText()
      }

      const namedImports = decl.getNamedImports()
      if (namedImports.length > 0) {
        result.namedImports = namedImports.map((ni) => ({
          name: ni.getName(),
          alias: ni.getAliasNode()?.getText(),
        }))
      }

      const namespaceImport = decl.getNamespaceImport()
      if (namespaceImport) {
        result.namespaceImport = namespaceImport.getText()
      }

      if (decl.isTypeOnly()) {
        result.isTypeOnly = true
      }

      return result
    })
  }

  /**
   * Extract metadata from `export const meta: BlockMeta = { ... }`
   */
  private extractMeta(sourceFile: SourceFile): BlockMeta | undefined {
    // Look for: export const meta = { ... }
    const metaVar = sourceFile
      .getVariableDeclarations()
      .find((v) => v.getName() === "meta" && v.isExported())

    if (!metaVar) return undefined

    const initializer = metaVar.getInitializer()
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      return undefined
    }

    const meta: BlockMeta = {}

    for (const prop of initializer.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue

      const name = prop.getName()
      const value = prop.getInitializer()

      if (!value) continue

      if (name === "title" && Node.isStringLiteral(value)) {
        meta.title = value.getLiteralValue()
      } else if (name === "description" && Node.isStringLiteral(value)) {
        meta.description = value.getLiteralValue()
      } else if (name === "refreshable") {
        if (Node.isTrueLiteral(value)) {
          meta.refreshable = true
        } else if (Node.isFalseLiteral(value)) {
          meta.refreshable = false
        }
      }
    }

    return Object.keys(meta).length > 0 ? meta : undefined
  }

  /**
   * Find the default exported function
   */
  private findDefaultExport(
    sourceFile: SourceFile
  ): FunctionDeclaration | ArrowFunction | FunctionExpression | null {
    // Check for `export default function Foo() {}`
    const defaultExportSymbol = sourceFile.getDefaultExportSymbol()
    if (!defaultExportSymbol) return null

    const declarations = defaultExportSymbol.getDeclarations()
    for (const decl of declarations) {
      // Direct function declaration export
      if (Node.isFunctionDeclaration(decl)) {
        return decl
      }

      // Export assignment: export default Foo
      if (Node.isExportAssignment(decl)) {
        const expr = decl.getExpression()

        // Direct arrow/function expression
        if (Node.isArrowFunction(expr) || Node.isFunctionExpression(expr)) {
          return expr
        }

        // Identifier reference
        if (Node.isIdentifier(expr)) {
          const symbol = expr.getSymbol()
          if (symbol) {
            const varDecls = symbol.getDeclarations()
            for (const varDecl of varDecls) {
              if (Node.isVariableDeclaration(varDecl)) {
                const init = varDecl.getInitializer()
                if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                  return init
                }
              }
              if (Node.isFunctionDeclaration(varDecl)) {
                return varDecl
              }
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Extract function signature and prop types
   */
  private extractSignature(
    sourceFile: SourceFile,
    func: FunctionDeclaration | ArrowFunction | FunctionExpression
  ): BlockSignature {
    const typeChecker = this.project.getTypeChecker()
    const isAsync = func.isAsync()

    // Try to extract props type from the first parameter
    const params = func.getParameters()
    const propsType = this.extractPropsSchema(params[0], typeChecker)

    // Get function name if it's a named function
    let functionName: string | undefined
    if (Node.isFunctionDeclaration(func)) {
      functionName = func.getName()
    }

    return {
      propsType,
      isAsync,
      functionName,
    }
  }

  /**
   * Extract prop schema from function parameter type
   */
  private extractPropsSchema(
    param: Node | undefined,
    typeChecker: TypeChecker
  ): PropSchema {
    const emptySchema: PropSchema = { properties: {}, required: [] }
    if (!param) return emptySchema

    // Handle destructured parameter: ({ ctx, limit = 10 })
    if (Node.isParameterDeclaration(param)) {
      const nameNode = param.getNameNode()

      // Object binding pattern (destructured)
      if (Node.isObjectBindingPattern(nameNode)) {
        const type = typeChecker.getTypeAtLocation(param)
        return this.typeToSchema(type, typeChecker)
      }

      // Simple identifier with type annotation
      const typeNode = param.getTypeNode()
      if (typeNode) {
        const type = typeChecker.getTypeAtLocation(typeNode)
        return this.typeToSchema(type, typeChecker)
      }
    }

    return emptySchema
  }

  /**
   * Convert a TypeScript type to PropSchema
   */
  private typeToSchema(type: Type, typeChecker: TypeChecker): PropSchema {
    const properties: Record<string, PropDefinition> = {}
    const required: string[] = []

    // Get properties of the type
    const props = type.getProperties()
    for (const prop of props) {
      const name = prop.getName()

      // Skip the ctx prop - it's runtime-injected
      if (name === "ctx") continue

      const propType = typeChecker.getTypeOfSymbolAtLocation(
        prop,
        prop.getValueDeclaration() ?? prop.getDeclarations()[0]
      )

      properties[name] = this.typeToDefinition(propType, typeChecker, prop)

      // Check if required (not optional)
      if (!(prop.getFlags() & 16777216)) {
        // SymbolFlags.Optional
        required.push(name)
      }
    }

    return { properties, required }
  }

  /**
   * Convert a TypeScript type to PropDefinition
   */
  private typeToDefinition(
    type: Type,
    typeChecker: TypeChecker,
    symbol?: TsSymbol
  ): PropDefinition {
    const def: PropDefinition = { type: "unknown" }

    // Get JSDoc comment if available
    if (symbol) {
      const jsDoc = symbol.getJsDocTags()
      const descTag = jsDoc.find((t) => t.getName() === "description")
      if (descTag) {
        def.description = descTag.getText().map((t) => t.text).join("")
      }
    }

    // Determine type
    if (type.isString() || type.isStringLiteral()) {
      def.type = "string"
      if (type.isStringLiteral()) {
        def.literalOptions = [type.getLiteralValue() as string]
      }
    } else if (type.isNumber() || type.isNumberLiteral()) {
      def.type = "number"
    } else if (type.isBoolean() || type.isBooleanLiteral()) {
      def.type = "boolean"
    } else if (type.isArray()) {
      def.type = "array"
      const elemType = type.getArrayElementType()
      if (elemType) {
        def.itemType = this.typeToDefinition(elemType, typeChecker)
      }
    } else if (type.isUnion()) {
      def.type = "union"
      def.unionTypes = type
        .getUnionTypes()
        .map((t) => this.typeToDefinition(t, typeChecker))

      // Check if it's a string literal union (enum-like)
      const literals = type.getUnionTypes().filter((t) => t.isStringLiteral())
      if (literals.length === type.getUnionTypes().length) {
        def.literalOptions = literals.map((t) => t.getLiteralValue() as string)
        def.editor = "select"
      }
    } else if (type.isObject()) {
      def.type = "object"
      def.objectSchema = this.typeToSchema(type, typeChecker)
    }

    // Check for optional
    if (symbol && symbol.getFlags() & 16777216) {
      def.optional = true
    }

    return def
  }

  /**
   * Extract the JSX tree from the function's return statement
   */
  private extractJsxTree(
    func: FunctionDeclaration | ArrowFunction | FunctionExpression,
    errors: string[]
  ): JsxNode {
    // For arrow functions with expression body
    if (Node.isArrowFunction(func)) {
      const body = func.getBody()
      if (body && !Node.isBlock(body)) {
        // Expression body - the body IS the JSX
        return this.nodeToJsxNode(body, errors)
      }
    }

    // For block body - find return statement
    const returnStatements = func.getDescendantsOfKind(SyntaxKind.ReturnStatement)
    if (returnStatements.length === 0) {
      errors.push("No return statement found in block function")
      return this.createEmptyRoot()
    }

    // Use the last return statement (handles early returns)
    const lastReturn = returnStatements[returnStatements.length - 1]
    const expr = lastReturn.getExpression()

    if (!expr) {
      errors.push("Return statement has no expression")
      return this.createEmptyRoot()
    }

    return this.nodeToJsxNode(expr, errors)
  }

  /**
   * Convert a ts-morph Node to our JsxNode
   */
  private nodeToJsxNode(node: Node, errors: string[]): JsxNode {
    // Handle parenthesized expressions
    if (Node.isParenthesizedExpression(node)) {
      return this.nodeToJsxNode(node.getExpression(), errors)
    }

    // JSX Element: <div>...</div>
    if (Node.isJsxElement(node)) {
      return this.jsxElementToNode(node, errors)
    }

    // Self-closing: <Component />
    if (Node.isJsxSelfClosingElement(node)) {
      return this.jsxSelfClosingToNode(node, errors)
    }

    // Fragment: <>...</>
    if (Node.isJsxFragment(node)) {
      return this.jsxFragmentToNode(node, errors)
    }

    // Text: literal text
    if (Node.isJsxText(node)) {
      const text = node.getText().trim()
      if (!text) {
        return { id: this.generateId(), type: "text", text: "" }
      }
      return { id: this.generateId(), type: "text", text }
    }

    // Expression: {something}
    if (Node.isJsxExpression(node)) {
      const expr = node.getExpression()
      return {
        id: this.generateId(),
        type: "expression",
        expression: expr?.getText() ?? "",
        sourceRange: {
          start: node.getStart(),
          end: node.getEnd(),
        },
      }
    }

    // Unknown - treat as expression
    return {
      id: this.generateId(),
      type: "expression",
      expression: node.getText(),
      sourceRange: {
        start: node.getStart(),
        end: node.getEnd(),
      },
    }
  }

  /**
   * Convert JSX element to node
   */
  private jsxElementToNode(element: JsxElement, errors: string[]): JsxNode {
    const openingElement = element.getOpeningElement()
    const tagName = openingElement.getTagNameNode().getText()

    const props = this.extractJsxProps(openingElement.getAttributes(), errors)

    const children = element
      .getJsxChildren()
      .map((child) => this.nodeToJsxNode(child, errors))
      .filter((c) => !(c.type === "text" && !c.text?.trim()))

    return {
      id: this.generateId(),
      type: "element",
      tagName,
      props,
      children,
      sourceRange: {
        start: element.getStart(),
        end: element.getEnd(),
      },
    }
  }

  /**
   * Convert self-closing JSX element to node
   */
  private jsxSelfClosingToNode(element: JsxSelfClosingElement, errors: string[]): JsxNode {
    const tagName = element.getTagNameNode().getText()
    const props = this.extractJsxProps(element.getAttributes(), errors)

    return {
      id: this.generateId(),
      type: "element",
      tagName,
      props,
      children: [],
      sourceRange: {
        start: element.getStart(),
        end: element.getEnd(),
      },
    }
  }

  /**
   * Convert JSX fragment to node
   */
  private jsxFragmentToNode(fragment: JsxFragment, errors: string[]): JsxNode {
    const children = fragment
      .getJsxChildren()
      .map((child) => this.nodeToJsxNode(child, errors))
      .filter((c) => !(c.type === "text" && !c.text?.trim()))

    return {
      id: this.generateId(),
      type: "fragment",
      children,
      sourceRange: {
        start: fragment.getStart(),
        end: fragment.getEnd(),
      },
    }
  }

  /**
   * Extract props from JSX attributes
   */
  private extractJsxProps(
    attributes: (JsxAttribute | JsxSpreadAttribute)[],
    errors: string[]
  ): Record<string, PropValue> {
    const props: Record<string, PropValue> = {}

    for (const attr of attributes) {
      // Spread attribute: {...props}
      if (Node.isJsxSpreadAttribute(attr)) {
        // Store as special spread prop
        props["...spread"] = {
          type: "expression",
          value: attr.getExpression().getText(),
          rawSource: attr.getText(),
        }
        continue
      }

      // Regular attribute: name="value" or name={expr}
      const name = attr.getNameNode().getText()
      const initializer = attr.getInitializer()

      if (!initializer) {
        // Boolean shorthand: <Input disabled />
        props[name] = { type: "literal", value: true }
        continue
      }

      // String literal: name="value"
      if (Node.isStringLiteral(initializer)) {
        props[name] = { type: "literal", value: initializer.getLiteralValue() }
        continue
      }

      // Expression: name={expr}
      if (Node.isJsxExpression(initializer)) {
        const expr = initializer.getExpression()
        if (!expr) {
          props[name] = { type: "expression", value: "" }
          continue
        }

        // Try to extract literal values
        if (Node.isStringLiteral(expr)) {
          props[name] = { type: "literal", value: expr.getLiteralValue() }
        } else if (Node.isNumericLiteral(expr)) {
          props[name] = { type: "literal", value: expr.getLiteralValue() }
        } else if (Node.isTrueLiteral(expr)) {
          props[name] = { type: "literal", value: true }
        } else if (Node.isFalseLiteral(expr)) {
          props[name] = { type: "literal", value: false }
        } else if (Node.isNullLiteral(expr)) {
          props[name] = { type: "literal", value: null }
        } else {
          // Complex expression
          props[name] = {
            type: "expression",
            value: expr.getText(),
            rawSource: expr.getText(),
          }
        }
      }
    }

    return props
  }

  /**
   * Extract SQL queries from ctx.sql tagged template literals
   */
  private extractSqlQueries(
    func: FunctionDeclaration | ArrowFunction | FunctionExpression
  ): SqlQuery[] {
    const queries: SqlQuery[] = []

    // Find all tagged template expressions: ctx.sql`...` or ctx.db.sql`...`
    const taggedTemplates = func.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)

    for (const template of taggedTemplates) {
      const tag = template.getTag()

      // Check if it's ctx.sql or ctx.db.sql
      const tagText = tag.getText()
      if (!tagText.includes("ctx.sql") && !tagText.includes("ctx.db.sql")) {
        continue
      }

      // Find the variable declaration this is assigned to
      const parent = template.getParent()
      let variableName = "result"

      if (Node.isVariableDeclaration(parent)) {
        variableName = parent.getName()
      } else if (Node.isAwaitExpression(parent)) {
        const awaitParent = parent.getParent()
        if (Node.isVariableDeclaration(awaitParent)) {
          variableName = awaitParent.getName()
        }
      }

      // Extract the template literal
      const templateLiteral = template.getTemplate()
      let sql = ""
      const interpolations: Array<{ index: number; expression: string }> = []

      if (Node.isNoSubstitutionTemplateLiteral(templateLiteral)) {
        sql = templateLiteral.getLiteralText()
      } else if (Node.isTemplateExpression(templateLiteral)) {
        // Has interpolations
        sql = templateLiteral.getHead().getLiteralText()

        const spans = templateLiteral.getTemplateSpans()
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i]
          interpolations.push({
            index: i,
            expression: span.getExpression().getText(),
          })
          sql += `$${i + 1}` // Placeholder
          sql += span.getLiteral().getLiteralText()
        }
      }

      // Try to extract result type from type annotation
      let resultType: string | undefined
      if (Node.isVariableDeclaration(parent) || Node.isAwaitExpression(parent)) {
        const varDecl = Node.isVariableDeclaration(parent)
          ? parent
          : Node.isVariableDeclaration(parent.getParent())
          ? parent.getParent()
          : null

        if (varDecl && Node.isVariableDeclaration(varDecl)) {
          const typeNode = varDecl.getTypeNode()
          if (typeNode) {
            resultType = typeNode.getText()
          }
        }
      }

      queries.push({
        id: this.generateId(),
        variableName,
        resultType,
        templateLiteral: sql,
        interpolations: interpolations.length > 0 ? interpolations : undefined,
        sourceRange: {
          start: template.getStart(),
          end: template.getEnd(),
        },
      })
    }

    return queries
  }

  /**
   * Create empty signature for error cases
   */
  private createEmptySignature(): BlockSignature {
    return {
      propsType: { properties: {}, required: [] },
      isAsync: true,
    }
  }

  /**
   * Create empty root node for error cases
   */
  private createEmptyRoot(): JsxNode {
    return {
      id: this.generateId(),
      type: "fragment",
      children: [],
    }
  }

  /**
   * Generate unique ID for nodes
   */
  private generateId(): string {
    return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  }

  /**
   * Hash source code for change detection
   */
  private hashSource(source: string): string {
    return createHash("md5").update(source).digest("hex")
  }
}

/**
 * Singleton parser instance
 */
let parserInstance: BlockParser | null = null

/**
 * Get the shared parser instance
 */
export function getParser(): BlockParser {
  if (!parserInstance) {
    parserInstance = new BlockParser()
  }
  return parserInstance
}

/**
 * Parse a block file
 */
export async function parseBlock(filePath: string, source: string): Promise<BlockModel> {
  return getParser().parseBlock(filePath, source)
}
