/**
 * Sidebar Types
 */

export interface SidebarPage {
  id: string;
  route: string;
  path: string;
  parentDir: string;
  isBlock: boolean;
  title: string;
}

export interface SidebarPlugin {
  id: string;
  name: string;
  path: string;
  description?: string;
}

export interface SidebarAction {
  id: string;
  name?: string;
  description?: string;
  schedule?: string;
  triggers?: string[];
  path: string;
  /** Whether the action loaded successfully */
  valid: boolean;
  /** Error message if action failed to load */
  error?: string;
}

export interface SidebarSource {
  id: string;
  name: string;
  title: string;
  description: string;
  schedule?: string;
  secrets: string[];
  missingSecrets: string[];
  path: string;
  spec?: string;
}

export interface SidebarTable {
  name: string;
  columns: string[];
}
