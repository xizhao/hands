/**
 * Notebook routes - /notebook
 *
 * Load/save notebook.json for the Plate editor
 */

import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export function registerNotebookRoutes(router: Router, getState: () => RuntimeState | null): void {
  // GET /notebook - Load notebook.json
  router.get("/notebook", () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const notebookPath = join(state.workbookDir, "notebook.json");

    if (!existsSync(notebookPath)) {
      // Return empty notebook
      return json({
        version: 1,
        content: [],
        modified: new Date().toISOString(),
      });
    }

    const content = readFileSync(notebookPath, "utf-8");
    return json(JSON.parse(content));
  });

  // PUT /notebook - Save notebook.json
  router.put("/notebook", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = await req.json() as { content: unknown[] };
    const notebookPath = join(state.workbookDir, "notebook.json");

    const notebook = {
      version: 1,
      content: body.content,
      modified: new Date().toISOString(),
    };

    writeFileSync(notebookPath, JSON.stringify(notebook, null, 2));
    return json({ success: true });
  });
}
