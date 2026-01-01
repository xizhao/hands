import styles from "./styles.css?url";
import type { NavPage } from "../nav/types";

interface DocumentProps {
  children: React.ReactNode;
  /** Navigation pages for client-side nav widget */
  navPages?: NavPage[];
  /** Workbook title */
  workbookTitle?: string;
}

/**
 * Root Document component for rwsdk.
 * Renders the HTML shell - use with render(Document, [routes]) in worker.
 */
export const Document: React.FC<DocumentProps> = ({ children, navPages, workbookTitle }) => {
  // Build nav config for client injection
  const navConfig = navPages?.length
    ? JSON.stringify({
        pages: navPages,
        workbookTitle,
      })
    : null;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{workbookTitle || "Hands"}</title>
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body>
        {/* Inject nav config as JSON (no CSP issues) */}
        {navConfig && (
          <script
            id="__NAV_CONFIG__"
            type="application/json"
            dangerouslySetInnerHTML={{ __html: navConfig }}
          />
        )}
        <div id="root">{children}</div>
        <script>import("/src/client.tsx")</script>
      </body>
    </html>
  );
};
