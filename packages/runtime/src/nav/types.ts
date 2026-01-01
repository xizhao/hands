/**
 * Navigation types for static runtime
 */

export interface NavPage {
  /** Display title */
  title: string;
  /** Route path (e.g., "/getting-started") */
  route: string;
  /** Optional icon name */
  icon?: string;
  /** Nested pages */
  children?: NavPage[];
}

export interface NavConfig {
  /** All pages in the workbook */
  pages: NavPage[];
  /** Current page route */
  currentRoute: string;
  /** Workbook title */
  workbookTitle?: string;
  /** Workbook logo URL */
  logoUrl?: string;
}
