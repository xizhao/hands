import styles from "./styles.css?url";

interface PageProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export const Page: React.FC<PageProps> = ({ children, title, description }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title || "Untitled"}</title>
        {description && <meta name="description" content={description} />}
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
