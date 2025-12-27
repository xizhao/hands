import styles from "./styles.css?url";

interface DocumentProps {
  children: React.ReactNode;
}

/**
 * Root Document component for rwsdk.
 * Renders the HTML shell - use with render(Document, [routes]) in worker.
 */
export const Document: React.FC<DocumentProps> = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Hands</title>
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script>import("/src/client.tsx")</script>
      </body>
    </html>
  );
};
