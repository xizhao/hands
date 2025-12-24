/**
 * ActionCodeView - Syntax-highlighted code view for actions
 */

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ActionCodeViewProps {
  source: string;
}

export function ActionCodeView({ source }: ActionCodeViewProps) {
  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        language="typescript"
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "transparent",
          fontSize: "13px",
          lineHeight: "1.5",
        }}
        showLineNumbers
        lineNumberStyle={{
          minWidth: "3em",
          paddingRight: "1em",
          color: "#666",
          userSelect: "none",
        }}
      >
        {source}
      </SyntaxHighlighter>
    </div>
  );
}
