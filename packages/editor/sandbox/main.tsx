import './styles.css';
import { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, type EditorHandle } from '@hands/editor';
import { LiveQueryProvider, type QueryResult } from '@hands/core/stdlib';

// Mock data for different queries
const MOCK_DATA: Record<string, Record<string, unknown>[]> = {
  'SELECT status, COUNT(*) as count FROM features GROUP BY status': [
    { status: 'done', count: 12 },
    { status: 'in_progress', count: 8 },
    { status: 'todo', count: 5 },
  ],
  'SELECT COUNT(*) FROM users': [{ 'COUNT(*)': 42 }],
};

// Mock query hook for sandbox
function useMockQuery(sql: string): QueryResult {
  const data = MOCK_DATA[sql] ?? [{ result: `Mock result for: ${sql.slice(0, 30)}...` }];
  return { data, isLoading: false, error: null };
}

// Mock mutation hook for sandbox
function useMockMutation() {
  return {
    mutate: async (sql: string) => console.log('[Mock] Mutation:', sql),
    isPending: false,
    error: null,
  };
}

const initialMarkdown = `# Editor Sandbox

This is a standalone preview of the **@hands/editor** package.

## Inline Value

I have this many apples: <LiveValue query="SELECT COUNT(*) FROM users" /> - pretty cool right?

## Chart Example

<LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
  <BarChart xKey="status" yKey="count" />
</LiveValue>

## Form Example

<LiveAction sql="UPDATE tasks SET status = :status WHERE id = 1">
  <Select name="status" options={[{ value: "todo", label: "To Do" }, { value: "done", label: "Done" }]}>Status</Select>
  <Button>Update Task</Button>
</LiveAction>

## Features

- Rich text editing
- Markdown serialization
- Inline LiveValue components
- Charts and data visualization
- Interactive forms with LiveAction
`;

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const editorRef = useRef<EditorHandle>(null);

  const handleChange = (md: string) => {
    setMarkdown(md);
  };

  return (
    <div className="sandbox">
      <header className="sandbox-header">
        <h1>@hands/editor Sandbox</h1>
        <span className="sandbox-hint">Edit in editor, see markdown output</span>
      </header>

      <main className="sandbox-main">
        <div className="editor-container">
          <div className="panel-header">
            <span>Editor</span>
          </div>
          <LiveQueryProvider useQuery={useMockQuery} useMutation={useMockMutation}>
            <Editor
              ref={editorRef}
              value={markdown}
              onChange={handleChange}
              placeholder="Start typing..."
              autoFocus
            />
          </LiveQueryProvider>
        </div>

        <aside className="markdown-panel">
          <div className="panel-header">
            <span>Markdown Output</span>
          </div>
          <textarea
            className="markdown-textarea"
            value={markdown}
            readOnly
            spellCheck={false}
          />
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
