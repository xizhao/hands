/**
 * Walk the run function AST to extract execution flow
 *
 * Walks through the run function body step-by-step to understand:
 * - SQL queries and which tables they touch
 * - Fetch calls to external APIs
 * - Control flow (if/else, loops)
 * - Variable assignments
 * - Return statements
 */

import { Project, SyntaxKind, Node, SourceFile } from "ts-morph";
import type {
  ActionFlow,
  FlowStep,
  SqlStep,
  FetchStep,
  ConditionStep,
  LoopStep,
  TableSummary,
  ExternalSource,
  SourceLocation,
} from "./types";
import { analyzeSql } from "./analyze-sql";

let stepIdCounter = 0;

function generateStepId(): string {
  return `step-${++stepIdCounter}`;
}

function getLocation(node: Node): SourceLocation {
  const start = node.getStartLineNumber();
  const end = node.getEndLineNumber();
  return {
    line: start,
    column: 1, // Simplified - column calculation requires more complex logic
    endLine: end,
    endColumn: 1,
  };
}

/**
 * Extract action flow from source code
 */
export function extractActionFlow(source: string): ActionFlow {
  stepIdCounter = 0;

  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("action.ts", source);

  // Find the action name
  const name = extractActionName(sourceFile);

  // Find the run function
  const runFunction = findRunFunction(sourceFile);

  const steps: FlowStep[] = [];
  const sources: ExternalSource[] = [];

  if (runFunction) {
    const body = runFunction.getBody();
    if (body && Node.isBlock(body)) {
      for (const statement of body.getStatements()) {
        const extracted = walkStatement(statement, sources);
        steps.push(...extracted);
      }
    }
  }

  // Also check for schedule/triggers in the action definition
  extractTriggers(sourceFile, sources);

  // Build table summary
  const tables = buildTableSummary(steps);

  return { name, steps, tables, sources };
}

/**
 * Extract action name from defineAction call
 */
function extractActionName(sourceFile: SourceFile): string {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getText() === "defineAction") {
      const args = call.getArguments();
      if (args.length > 0) {
        const config = args[0];
        if (Node.isObjectLiteralExpression(config)) {
          const nameProp = config.getProperty("name");
          if (nameProp && Node.isPropertyAssignment(nameProp)) {
            const init = nameProp.getInitializer();
            if (init && Node.isStringLiteral(init)) {
              return init.getLiteralText();
            }
          }
        }
      }
    }
  }

  return "unknown";
}

/**
 * Find the run function in the action definition
 */
function findRunFunction(sourceFile: SourceFile): Node | null {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getText() === "defineAction") {
      const args = call.getArguments();
      if (args.length > 0) {
        const config = args[0];
        if (Node.isObjectLiteralExpression(config)) {
          const runProp = config.getProperty("run");
          if (runProp) {
            if (Node.isMethodDeclaration(runProp)) {
              return runProp;
            }
            if (Node.isPropertyAssignment(runProp)) {
              const init = runProp.getInitializer();
              if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                return init;
              }
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract triggers (schedule, webhook) from action definition
 */
function extractTriggers(sourceFile: SourceFile, sources: ExternalSource[]): void {
  const seenIds = new Set(sources.map((s) => s.id));

  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  for (const obj of objectLiterals) {
    for (const prop of obj.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const propName = prop.getName();

        if (propName === "schedule") {
          const init = prop.getInitializer();
          if (init && Node.isStringLiteral(init) && !seenIds.has("schedule")) {
            seenIds.add("schedule");
            sources.push({
              id: "schedule",
              type: "schedule",
              name: init.getLiteralText(),
            });
          }
        }

        if (propName === "triggers") {
          const init = prop.getInitializer();
          if (init && init.getText().includes("webhook") && !seenIds.has("webhook")) {
            seenIds.add("webhook");
            sources.push({
              id: "webhook",
              type: "webhook",
              name: "Webhook",
            });
          }
        }
      }
    }
  }
}

/**
 * Walk a statement and extract flow steps
 */
function walkStatement(statement: Node, sources: ExternalSource[]): FlowStep[] {
  const steps: FlowStep[] = [];

  // Variable declaration (const x = ...)
  if (Node.isVariableStatement(statement)) {
    for (const decl of statement.getDeclarationList().getDeclarations()) {
      const init = decl.getInitializer();
      if (init) {
        const extracted = walkExpression(init, decl.getName(), sources);
        if (extracted) {
          extracted.location = getLocation(statement);
          steps.push(extracted);
        }
      }
    }
    return steps;
  }

  // Expression statement (await something, function call, etc.)
  if (Node.isExpressionStatement(statement)) {
    const expr = statement.getExpression();
    const extracted = walkExpression(expr, undefined, sources);
    if (extracted) {
      extracted.location = getLocation(statement);
      steps.push(extracted);
    }
    return steps;
  }

  // If statement
  if (Node.isIfStatement(statement)) {
    const condition = statement.getExpression().getText();
    const thenBranch: FlowStep[] = [];
    const elseBranch: FlowStep[] = [];

    const thenStmt = statement.getThenStatement();
    if (Node.isBlock(thenStmt)) {
      for (const s of thenStmt.getStatements()) {
        thenBranch.push(...walkStatement(s, sources));
      }
    } else {
      thenBranch.push(...walkStatement(thenStmt, sources));
    }

    const elseStmt = statement.getElseStatement();
    if (elseStmt) {
      if (Node.isBlock(elseStmt)) {
        for (const s of elseStmt.getStatements()) {
          elseBranch.push(...walkStatement(s, sources));
        }
      } else {
        elseBranch.push(...walkStatement(elseStmt, sources));
      }
    }

    const conditionStep: ConditionStep = {
      condition,
      thenBranch,
      elseBranch: elseBranch.length > 0 ? elseBranch : undefined,
    };

    steps.push({
      id: generateStepId(),
      type: "condition",
      location: getLocation(statement),
      condition: conditionStep,
    });
    return steps;
  }

  // For/ForOf/ForIn/While loops
  if (Node.isForStatement(statement) || Node.isForOfStatement(statement) ||
      Node.isForInStatement(statement) || Node.isWhileStatement(statement)) {
    const body: FlowStep[] = [];
    let loopType: "for" | "for-of" | "for-in" | "while" = "for";
    let iterates: string | undefined;

    if (Node.isForOfStatement(statement)) {
      loopType = "for-of";
      const init = statement.getInitializer();
      if (init) iterates = init.getText();
    } else if (Node.isForInStatement(statement)) {
      loopType = "for-in";
      const init = statement.getInitializer();
      if (init) iterates = init.getText();
    } else if (Node.isWhileStatement(statement)) {
      loopType = "while";
    }

    const loopBody = statement.getStatement();
    if (Node.isBlock(loopBody)) {
      for (const s of loopBody.getStatements()) {
        body.push(...walkStatement(s, sources));
      }
    } else {
      body.push(...walkStatement(loopBody, sources));
    }

    const loopStep: LoopStep = { loopType, iterates, body };
    steps.push({
      id: generateStepId(),
      type: "loop",
      location: getLocation(statement),
      loop: loopStep,
    });
    return steps;
  }

  // Return statement
  if (Node.isReturnStatement(statement)) {
    const expr = statement.getExpression();
    const expression = expr?.getText() ?? "";
    const references = expr ? extractVariableReferences(expr) : [];

    steps.push({
      id: generateStepId(),
      type: "return",
      location: getLocation(statement),
      returnValue: { expression, references },
    });
    return steps;
  }

  // Try/Catch - walk the try block
  if (Node.isTryStatement(statement)) {
    const tryBlock = statement.getTryBlock();
    for (const s of tryBlock.getStatements()) {
      steps.push(...walkStatement(s, sources));
    }
    return steps;
  }

  return steps;
}

/**
 * Walk an expression and extract flow step
 */
function walkExpression(
  expr: Node,
  assignedTo: string | undefined,
  sources: ExternalSource[]
): FlowStep | null {
  // Await expression - unwrap
  if (Node.isAwaitExpression(expr)) {
    return walkExpression(expr.getExpression(), assignedTo, sources);
  }

  // Tagged template expression (ctx.sql`...`)
  if (Node.isTaggedTemplateExpression(expr)) {
    const tag = expr.getTag().getText();
    if (/ctx\.sql|ctx\.db\.(query|run)|^sql$/i.test(tag)) {
      const template = expr.getTemplate();
      const sqlText = extractTemplateText(template);
      if (sqlText) {
        const sqlAnalysis = analyzeSql(sqlText);
        const sqlStep: SqlStep = {
          raw: sqlText,
          operation: sqlAnalysis.operation,
          tables: sqlAnalysis.tables,
          ctes: sqlAnalysis.ctes,
          columns: sqlAnalysis.columns,
          assignedTo,
        };
        return {
          id: generateStepId(),
          type: "sql",
          location: getLocation(expr),
          sql: sqlStep,
        };
      }
    }
  }

  // Call expression
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression().getText();

    // fetch() calls
    if (callee === "fetch" || callee.endsWith(".fetch")) {
      const args = expr.getArguments();
      let url = "";
      let method: FetchStep["method"] = "GET";

      if (args.length > 0) {
        url = extractStringValue(args[0]) ?? args[0].getText();
      }
      if (args.length > 1) {
        const options = args[1];
        if (Node.isObjectLiteralExpression(options)) {
          const methodProp = options.getProperty("method");
          if (methodProp && Node.isPropertyAssignment(methodProp)) {
            const methodVal = extractStringValue(methodProp.getInitializer()!);
            if (methodVal) {
              method = methodVal.toUpperCase() as FetchStep["method"];
            }
          }
        }
      }

      // Add to sources
      const apiSource = extractApiSource(url);
      if (apiSource && !sources.some((s) => s.id === apiSource.id)) {
        sources.push(apiSource);
      }

      return {
        id: generateStepId(),
        type: "fetch",
        location: getLocation(expr),
        fetch: { url, method, assignedTo },
      };
    }

    // ctx.log calls
    if (callee.startsWith("ctx.log")) {
      return {
        id: generateStepId(),
        type: "log",
        location: getLocation(expr),
      };
    }

    // Check for API client patterns in call
    const apiPatterns = [
      { pattern: /^shopify\./i, name: "Shopify" },
      { pattern: /^stripe\./i, name: "Stripe" },
      { pattern: /^slack\./i, name: "Slack" },
      { pattern: /^github\./i, name: "GitHub" },
      { pattern: /^notion\./i, name: "Notion" },
    ];

    for (const { pattern, name } of apiPatterns) {
      if (pattern.test(callee)) {
        const id = `api-${name.toLowerCase()}`;
        if (!sources.some((s) => s.id === id)) {
          sources.push({ id, type: "api", name });
        }
        return {
          id: generateStepId(),
          type: "fetch",
          location: getLocation(expr),
          fetch: { url: callee, method: "unknown", assignedTo },
        };
      }
    }
  }

  return null;
}

/**
 * Extract text from template literal, replacing interpolations with placeholders
 */
function extractTemplateText(template: Node): string | null {
  if (Node.isNoSubstitutionTemplateLiteral(template)) {
    return template.getLiteralText();
  }

  if (Node.isTemplateExpression(template)) {
    let result = template.getHead().getLiteralText();
    for (const span of template.getTemplateSpans()) {
      result += "'__PLACEHOLDER__'";
      result += span.getLiteral().getLiteralText();
    }
    return result;
  }

  return null;
}

/**
 * Extract string value from a node
 */
function extractStringValue(node: Node): string | null {
  if (Node.isStringLiteral(node)) {
    return node.getLiteralText();
  }
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return null;
}

/**
 * Extract variable references from an expression
 */
function extractVariableReferences(expr: Node): string[] {
  const refs: string[] = [];
  const identifiers = expr.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const id of identifiers) {
    const name = id.getText();
    // Skip common keywords and built-ins
    if (!["undefined", "null", "true", "false", "console", "Math", "Date", "JSON"].includes(name)) {
      if (!refs.includes(name)) {
        refs.push(name);
      }
    }
  }
  return refs;
}

/**
 * Extract API source info from URL
 */
function extractApiSource(url: string): ExternalSource | null {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    let name = urlObj.hostname.replace("www.", "").split(".")[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return { id: `api-${name.toLowerCase()}`, type: "api", name, endpoint: url };
  } catch {
    const segments = url.split("/").filter(Boolean);
    if (segments.length > 0 && !segments[0].includes("$")) {
      const name = segments[0];
      return { id: `api-${name.toLowerCase()}`, type: "api", name };
    }
    return null;
  }
}

/**
 * Build table summary from flow steps
 */
function buildTableSummary(steps: FlowStep[]): TableSummary[] {
  const tableMap = new Map<string, TableSummary>();

  function processSteps(stepList: FlowStep[]) {
    for (const step of stepList) {
      if (step.sql) {
        for (const tableRef of step.sql.tables) {
          const existing = tableMap.get(tableRef.table);
          if (existing) {
            if (!existing.operations.includes(step.sql.operation)) {
              existing.operations.push(step.sql.operation);
            }
            if (tableRef.usage === "read" || tableRef.usage === "both") {
              existing.isRead = true;
            }
            if (tableRef.usage === "write" || tableRef.usage === "both") {
              existing.isWritten = true;
            }
            existing.referencedBy.push(step.id);
          } else {
            tableMap.set(tableRef.table, {
              table: tableRef.table,
              operations: [step.sql.operation],
              isRead: tableRef.usage === "read" || tableRef.usage === "both",
              isWritten: tableRef.usage === "write" || tableRef.usage === "both",
              referencedBy: [step.id],
            });
          }
        }
      }

      // Process nested steps
      if (step.condition) {
        processSteps(step.condition.thenBranch);
        if (step.condition.elseBranch) {
          processSteps(step.condition.elseBranch);
        }
      }
      if (step.loop) {
        processSteps(step.loop.body);
      }
    }
  }

  processSteps(steps);
  return Array.from(tableMap.values());
}
