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
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          width: "100%",
          height: "auto",
          minHeight: "auto",
          background: "transparent",
        }}
      >
        <div id="root" style={{ display: "flow-root" }}>{children}</div>
        <script>import("/src/client.tsx")</script>
        <script>import("/src/preview-client.ts")</script>
      </body>
    </html>
  );
};
