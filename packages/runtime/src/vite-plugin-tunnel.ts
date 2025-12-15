import { spawn, type ChildProcess } from "child_process";
import type { Plugin, ViteDevServer } from "vite";

interface TunnelPluginOptions {
  enabled?: boolean;
}

interface RuntimeMetadata {
  publicUrl: string | null;
  localUrl: string;
  status: "connecting" | "connected" | "error";
  error?: string;
}

export function tunnelPlugin(options: TunnelPluginOptions = {}): Plugin {
  const { enabled = true } = options;

  let tunnelProcess: ChildProcess | null = null;
  let metadata: RuntimeMetadata = {
    publicUrl: null,
    localUrl: "",
    status: "connecting",
  };

  return {
    name: "hands-tunnel",
    apply: "serve",

    configureServer(server: ViteDevServer) {
      if (!enabled) return;

      // Add middleware to expose metadata at /__hands__
      server.middlewares.use((req, res, next) => {
        if (req.url === "/__hands__") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(metadata, null, 2));
          return;
        }
        next();
      });

      // Start tunnel when server is listening
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const port = typeof address === "object" ? address?.port : 5173;
        metadata.localUrl = `http://localhost:${port}`;

        startTunnel(port);
      });
    },

    closeBundle() {
      if (tunnelProcess) {
        tunnelProcess.kill();
        tunnelProcess = null;
      }
    },
  };

  function startTunnel(port: number) {
    try {
      tunnelProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      tunnelProcess.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        // cloudflared outputs the URL to stderr
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          metadata.publicUrl = match[0];
          metadata.status = "connected";
          console.log(`\n  ➜  Tunnel:  ${metadata.publicUrl}\n`);
        }
      });

      tunnelProcess.on("error", (err) => {
        metadata.status = "error";
        metadata.error = err.message;
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          console.log("\n  ⚠  cloudflared not installed. Run: brew install cloudflared\n");
        }
      });

      tunnelProcess.on("exit", (code) => {
        if (code !== 0 && metadata.status !== "error") {
          metadata.status = "error";
          metadata.error = `Tunnel exited with code ${code}`;
        }
        tunnelProcess = null;
      });
    } catch (err) {
      metadata.status = "error";
      metadata.error = String(err);
    }
  }
}
