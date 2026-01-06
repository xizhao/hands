/**
 * ContentHeader - Footer area with Excel-style bottom tabs
 *
 * Shows flat tab bar with all pages and tables: [page1] [page2] [table1] [+]
 * Tabs face upward connecting to the content above.
 */

import { ContentTabBar } from "./ContentTabBar";

export function ContentHeader() {
  // Google Sheets-style bottom tabs
  return (
    <footer className="h-7">
      <ContentTabBar />
    </footer>
  );
}
