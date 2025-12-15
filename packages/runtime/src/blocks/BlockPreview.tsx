import styles from "../pages/styles.css?url";

interface BlockPreviewProps {
  children: React.ReactNode;
}

export const BlockPreview: React.FC<BlockPreviewProps> = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Block Preview</title>
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body className="bg-gray-50 dark:bg-zinc-950 min-h-screen flex items-center justify-center p-8">
        <div id="root">{children}</div>
        <script>import("/src/client.tsx")</script>
      </body>
    </html>
  );
};
