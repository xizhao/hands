/**
 * Router - Extracted from monolithic server.ts
 *
 * Provides Hono-like route registration with middleware support.
 */

export type Handler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;
export type Middleware = (req: Request, ctx: RouteContext, next: () => Promise<Response>) => Response | Promise<Response>;

export interface RouteContext {
  params: Record<string, string>;
  url: URL;
  method: string;
}

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];

  /**
   * Add global middleware
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Register a route
   */
  on(method: string, path: string, handler: Handler): this {
    const { pattern, paramNames } = this.compilePath(path);
    this.routes.push({ method, pattern, paramNames, handler });
    return this;
  }

  get(path: string, handler: Handler): this {
    return this.on("GET", path, handler);
  }

  post(path: string, handler: Handler): this {
    return this.on("POST", path, handler);
  }

  put(path: string, handler: Handler): this {
    return this.on("PUT", path, handler);
  }

  delete(path: string, handler: Handler): this {
    return this.on("DELETE", path, handler);
  }

  /**
   * Handle an incoming request
   */
  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method;

    // Handle CORS preflight for any path
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method && route.method !== "*") continue;

      const match = route.pattern.exec(url.pathname);
      if (!match) continue;

      // Extract params
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      const ctx: RouteContext = { params, url, method };

      // Run middleware chain
      let idx = 0;
      const runMiddleware = async (): Promise<Response> => {
        if (idx < this.middlewares.length) {
          const mw = this.middlewares[idx++];
          return mw(req, ctx, runMiddleware);
        }
        return route.handler(req, ctx);
      };

      return runMiddleware();
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Compile a path pattern to regex
   * Supports :param and * wildcard
   */
  private compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    const regexStr = path
      .replace(/\/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return "/([^/]+)";
      })
      .replace(/\*/g, ".*");

    return {
      pattern: new RegExp(`^${regexStr}$`),
      paramNames,
    };
  }
}

/**
 * CORS middleware
 */
export function cors(): Middleware {
  return async (req, _ctx, next) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const response = await next();

    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * JSON response helper
 */
export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

/**
 * SSE response helper
 */
export function sse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
