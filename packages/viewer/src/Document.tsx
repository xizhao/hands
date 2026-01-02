/**
 * Viewer Document - HTML shell for rwsdk SSR/hydration
 */

import styles from "./styles.css?url";
import { getNavPages, getWorkbookTitle } from "./lib/request-context";

interface DocumentProps {
  children: React.ReactNode;
}

export const Document: React.FC<DocumentProps> = ({ children }) => {
  // Get nav data from request context
  const navPages = getNavPages();
  const workbookTitle = getWorkbookTitle();

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
        <title>{workbookTitle || "Hands Viewer"}</title>
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body>
        {/* Inject nav config as JSON */}
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
