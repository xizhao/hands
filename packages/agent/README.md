# @hands/agent

Custom OpenCode agents and tools for the Hands app.

## Structure

```
agents/       # Agent configurations (hands, coder, import)
docs/         # Documentation snippets for agent prompts
plugin/       # OpenCode plugins (diagnostics, etc.)
tool/         # Custom tools
src/          # Agent server entry point
```

## Tools

Tools are defined in `tool/*.ts` and symlinked to the workbook's `.opencode/tool/` directory at runtime.

### Zero-Dependency Requirement

**IMPORTANT:** Tools must be zero-dependency wrappers.

OpenCode loads tools in its own process context, separate from the main app. Any top-level imports from project packages (like `@hands/stdlib`) will fail because:

1. Module resolution context is different
2. Dependencies may not be available in OpenCode's context
3. Version mismatches (e.g., Zod versions) cause cryptic errors like `schema._zod is undefined`

### Patterns for Tools

**1. CLI Wrapper (Preferred)**
```typescript
import { spawn } from "node:child_process";
import { tool } from "@opencode-ai/plugin";

const myTool = tool({
  args: { ... },
  async execute(args) {
    // Spawn CLI command - no imports needed
    const result = await runCommand("hands-runtime", ["some-action", args.foo]);
    return result.stdout;
  }
});
```

**2. HTTP Wrapper**
```typescript
import { tool } from "@opencode-ai/plugin";

const myTool = tool({
  args: { ... },
  async execute(args) {
    // Hit runtime API - no imports needed
    const res = await fetch(`http://localhost:${port}/api/endpoint`);
    return await res.text();
  }
});
```

**3. Dynamic Import (Last Resort)**
```typescript
import { tool } from "@opencode-ai/plugin";

const myTool = tool({
  args: { ... },
  async execute(args) {
    // Dynamic import - loads only when called, not at discovery
    const { someFunction } = await import("@hands/stdlib/registry");
    return someFunction(args.query);
  }
});
```

### Allowed Top-Level Imports

Only these are safe at module scope:
- `@opencode-ai/plugin` - The plugin SDK
- `node:*` built-ins - `fs`, `path`, `child_process`, etc.

### Schema Limitations

The `tool.schema` object is a subset of Zod. Some methods may not work:
- `.record()` - Use a simpler type or accept JSON string
- Complex nested schemas - Keep args flat

### Testing Tools

After modifying a tool:
1. Kill the OpenCode server: `pkill -f opencode`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Restart the app

Check OpenCode logs for errors:
```bash
tail -f ~/.local/share/opencode/log/*.log | grep -i error
```
