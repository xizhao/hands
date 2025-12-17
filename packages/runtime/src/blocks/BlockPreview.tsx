import styles from "../pages/styles.css?url";

interface BlockPreviewProps {
  children: React.ReactNode;
}

export const BlockPreview: React.FC<BlockPreviewProps> = ({ children }) => {
  return (
    <html lang="en" style={{ height: "auto" }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Runtime's Tailwind CSS - scans workbook sources via @source plugin */}
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body
        className="prose max-w-none"
        style={{
          margin: 0,
          padding: 0,
          width: "100%",
          height: "auto",
          minHeight: "auto",
          background: "transparent",
        }}
      >
        <div
          id="root"
          style={{ display: "flow-root", height: "auto", minHeight: "auto" }}
        >
          {children}
        </div>
        <script>import("/src/preview-client.ts")</script>
      </body>
    </html>
  );
};

/**
 * Error preview component - renders inside BlockPreview and signals error to parent
 */
interface BlockErrorPreviewProps {
  error: string;
  blockId: string;
  isBuildError?: boolean;
}

export const BlockErrorPreview: React.FC<BlockErrorPreviewProps> = ({
  error,
  blockId,
  isBuildError,
}) => {
  // Script to signal error to parent iframe immediately
  const errorScript = `
    window.parent.postMessage({
      type: "sandbox-error",
      error: {
        message: ${JSON.stringify(error)},
        blockId: ${JSON.stringify(blockId)},
        isBuildError: ${isBuildError ? "true" : "false"},
        isRenderError: false,
      }
    }, "*");
  `;

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "8px",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        background:
          "linear-gradient(to right, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Error icon */}
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 32 32"
            fill="rgb(239, 68, 68)"
          >
            <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
          </svg>
        </div>

        {/* Error message */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "14px",
              color: "rgb(248, 113, 113)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {isBuildError ? "Build error: " : ""}
            {error}
          </span>
        </div>
      </div>

      {/* Signal error to parent */}
      <script dangerouslySetInnerHTML={{ __html: errorScript }} />
    </div>
  );
};
