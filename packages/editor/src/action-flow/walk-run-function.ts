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

import {
  type ArrowFunction,
  type FunctionExpression,
  type MethodDeclaration,
  Node,
  type ObjectLiteralExpression,
  Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { analyzeSql } from "./analyze-sql";
import type {
  ActionCallStep,
  ActionCallSummary,
  ActionFlow,
  ChainedAction,
  CloudCallStep,
  CloudServiceUsage,
  ConditionStep,
  ExternalSource,
  FetchStep,
  FlowStep,
  LoopStep,
  SourceLocation,
  SqlStep,
  TableSummary,
} from "./types";

/** Types that can represent a run function */
type RunFunctionNode = ArrowFunction | FunctionExpression | MethodDeclaration;

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

/** Context for collecting cloud services, action calls, and chains */
interface WalkContext {
  sources: ExternalSource[];
  cloudCalls: Map<string, Set<string>>; // service -> methods
  actionCalls: ActionCallSummary[];
  chains: ChainedAction[];
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
  const ctx: WalkContext = {
    sources: [],
    cloudCalls: new Map(),
    actionCalls: [],
    chains: [],
  };

  if (runFunction) {
    const body = runFunction.getBody();
    if (body && Node.isBlock(body)) {
      for (const statement of body.getStatements()) {
        const extracted = walkStatement(statement, ctx);
        steps.push(...extracted);
      }
    }
  }

  // Also check for schedule/triggers in the action definition
  extractTriggers(sourceFile, ctx.sources);

  // Build table summary
  const tables = buildTableSummary(steps);

  // Build cloud services summary
  const cloudServices: CloudServiceUsage[] = [];
  for (const [service, methods] of ctx.cloudCalls) {
    cloudServices.push({
      service: service as CloudServiceUsage["service"],
      methods: Array.from(methods),
    });
  }

  return {
    name,
    steps,
    tables,
    sources: ctx.sources,
    cloudServices,
    actionCalls: ctx.actionCalls,
    chains: ctx.chains,
  };
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
function findRunFunction(sourceFile: SourceFile): RunFunctionNode | null {
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
          if (init?.getText().includes("webhook") && !seenIds.has("webhook")) {
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
function walkStatement(statement: Node, ctx: WalkContext): FlowStep[] {
  const steps: FlowStep[] = [];

  // Variable declaration (const x = ...)
  if (Node.isVariableStatement(statement)) {
    for (const decl of statement.getDeclarationList().getDeclarations()) {
      const init = decl.getInitializer();
      if (init) {
        const extracted = walkExpression(init, decl.getName(), ctx);
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
    const extracted = walkExpression(expr, undefined, ctx);
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
        thenBranch.push(...walkStatement(s, ctx));
      }
    } else {
      thenBranch.push(...walkStatement(thenStmt, ctx));
    }

    const elseStmt = statement.getElseStatement();
    if (elseStmt) {
      if (Node.isBlock(elseStmt)) {
        for (const s of elseStmt.getStatements()) {
          elseBranch.push(...walkStatement(s, ctx));
        }
      } else {
        elseBranch.push(...walkStatement(elseStmt, ctx));
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
  if (
    Node.isForStatement(statement) ||
    Node.isForOfStatement(statement) ||
    Node.isForInStatement(statement) ||
    Node.isWhileStatement(statement)
  ) {
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
        body.push(...walkStatement(s, ctx));
      }
    } else {
      body.push(...walkStatement(loopBody, ctx));
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

    // Check if this is an ActionResult format: { data, chain }
    if (expr && Node.isObjectLiteralExpression(expr)) {
      const chains = extractChainedActions(expr);
      if (chains.length > 0) {
        ctx.chains.push(...chains);
      }
    }

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
      steps.push(...walkStatement(s, ctx));
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
  ctx: WalkContext,
): FlowStep | null {
  // Await expression - unwrap
  if (Node.isAwaitExpression(expr)) {
    return walkExpression(expr.getExpression(), assignedTo, ctx);
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

    // ctx.cloud.* calls (email, slack, github, etc.)
    const cloudMatch = callee.match(/^ctx\.cloud\.(\w+)\.(\w+)$/);
    if (cloudMatch) {
      const [, service, method] = cloudMatch;
      const args = expr.getArguments();
      const argsText = args.map((a) => a.getText()).join(", ");

      // Track cloud service usage
      if (!ctx.cloudCalls.has(service)) {
        ctx.cloudCalls.set(service, new Set());
      }
      ctx.cloudCalls.get(service)?.add(method);

      const cloudCall: CloudCallStep = {
        service: service as CloudCallStep["service"],
        method,
        args: argsText || undefined,
        assignedTo,
      };

      return {
        id: generateStepId(),
        type: "cloud_call",
        location: getLocation(expr),
        cloudCall,
      };
    }

    // ctx.cloud.fetch() - generic fetch
    if (callee === "ctx.cloud.fetch") {
      const args = expr.getArguments();
      const argsText = args.map((a) => a.getText()).join(", ");

      if (!ctx.cloudCalls.has("fetch")) {
        ctx.cloudCalls.set("fetch", new Set());
      }
      ctx.cloudCalls.get("fetch")?.add("request");

      const cloudCall: CloudCallStep = {
        service: "fetch",
        method: "request",
        args: argsText || undefined,
        assignedTo,
      };

      return {
        id: generateStepId(),
        type: "cloud_call",
        location: getLocation(expr),
        cloudCall,
      };
    }

    // ctx.actions.run() calls
    if (callee === "ctx.actions.run" || callee === "ctx.actions?.run") {
      const args = expr.getArguments();
      let actionId = "unknown";
      let input: string | undefined;

      if (args.length > 0) {
        actionId = extractStringValue(args[0]) ?? args[0].getText();
      }
      if (args.length > 1) {
        input = args[1].getText();
      }

      const stepId = generateStepId();
      ctx.actionCalls.push({ actionId, stepId });

      const actionCall: ActionCallStep = {
        actionId,
        input,
        assignedTo,
      };

      return {
        id: stepId,
        type: "action_call",
        location: getLocation(expr),
        actionCall,
      };
    }

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
      if (apiSource && !ctx.sources.some((s) => s.id === apiSource.id)) {
        ctx.sources.push(apiSource);
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
        if (!ctx.sources.some((s) => s.id === id)) {
          ctx.sources.push({ id, type: "api", name });
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

/**
 * Extract chained actions from a return { data, chain } statement
 *
 * Looks for patterns like:
 * return { data: ..., chain: [{ action: "...", input: {...} }] }
 */
function extractChainedActions(objLiteral: ObjectLiteralExpression): ChainedAction[] {
  const chains: ChainedAction[] = [];

  // Look for a "chain" property
  const chainProp = objLiteral.getProperty("chain");
  if (!chainProp || !Node.isPropertyAssignment(chainProp)) {
    return chains;
  }

  const init = chainProp.getInitializer();
  if (!init || !Node.isArrayLiteralExpression(init)) {
    return chains;
  }

  // Parse each chain entry
  for (const element of init.getElements()) {
    if (!Node.isObjectLiteralExpression(element)) continue;

    const chain: ChainedAction = { actionId: "unknown" };

    // Extract "action" property
    const actionProp = element.getProperty("action");
    if (actionProp && Node.isPropertyAssignment(actionProp)) {
      const actionInit = actionProp.getInitializer();
      if (actionInit) {
        const val = extractStringValue(actionInit);
        if (val) chain.actionId = val;
      }
    }

    // Extract "input" property
    const inputProp = element.getProperty("input");
    if (inputProp && Node.isPropertyAssignment(inputProp)) {
      const inputInit = inputProp.getInitializer();
      if (inputInit) {
        chain.input = inputInit.getText();
      }
    }

    // Extract "delay" property
    const delayProp = element.getProperty("delay");
    if (delayProp && Node.isPropertyAssignment(delayProp)) {
      const delayInit = delayProp.getInitializer();
      if (delayInit && Node.isNumericLiteral(delayInit)) {
        chain.delay = parseInt(delayInit.getText(), 10);
      }
    }

    // Extract "condition" property
    const conditionProp = element.getProperty("condition");
    if (conditionProp && Node.isPropertyAssignment(conditionProp)) {
      const condInit = conditionProp.getInitializer();
      if (condInit) {
        const val = extractStringValue(condInit);
        if (val === "success" || val === "always") {
          chain.condition = val;
        }
      }
    }

    chains.push(chain);
  }

  return chains;
}
