/**
 * RSC Error Boundary - Catches render errors from Flight-parsed React elements
 *
 * Use this to wrap any RSC content to prevent render errors from crashing the app.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RscErrorBoundaryProps {
  children: ReactNode;
  /** Key that resets the error boundary when changed (e.g., blockId) */
  resetKey?: string;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Compact mode for inline blocks */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

interface RscErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class RscErrorBoundary extends Component<RscErrorBoundaryProps, RscErrorBoundaryState> {
  constructor(props: RscErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RscErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RscErrorBoundary] Caught error in RSC render:", error, errorInfo);
  }

  // Reset error state when resetKey changes
  componentDidUpdate(prevProps: RscErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const { compact, className } = this.props;

      if (compact) {
        return (
          <div className={cn("flex items-center gap-2 p-3 text-destructive bg-destructive/5 rounded-md", className)}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm flex-1 truncate">
              {this.state.error?.message || "Render error"}
            </span>
            {this.props.onRetry && (
              <button
                onClick={this.handleRetry}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Retry"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      }

      return (
        <div className={cn("flex items-center justify-center h-full min-h-[200px]", className)}>
          <div className="text-center max-w-md p-6">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <h3 className="font-medium text-foreground mb-2">Block render error</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || "An error occurred while rendering this block"}
            </p>
            {this.props.onRetry && (
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-muted hover:bg-accent transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
            {this.state.error?.stack && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Stack trace
                </summary>
                <pre className="mt-2 p-2 text-[10px] bg-muted rounded overflow-auto max-h-32 whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
