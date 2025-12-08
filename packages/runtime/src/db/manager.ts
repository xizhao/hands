/**
 * PostgreSQL binary management and process lifecycle
 *
 * Downloads and manages embedded PostgreSQL binaries similar to pg_embed.
 * Each workbook gets its own postgres data directory for full isolation.
 */

import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync, chmodSync, readdirSync } from "fs";
import { join, dirname } from "path";
import type { ServiceStatus, ServiceState } from "../types";

const PG_VERSION = "18.1.0";

// Platform-specific cache directory for app binaries
function getCacheDir(): string {
  const home = process.env.HOME || "~";
  if (process.platform === "darwin") {
    return join(home, "Library", "Caches", "Hands");
  } else if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Hands", "Cache");
  } else {
    // Linux/Unix - use XDG_CACHE_HOME or fallback
    return join(process.env.XDG_CACHE_HOME || join(home, ".cache"), "hands");
  }
}

const PG_BINARIES_DIR = join(getCacheDir(), "postgres", PG_VERSION);

interface PostgresConfig {
  dataDir: string;
  port: number;
  user: string;         // Admin user (owns database, manages infrastructure)
  password: string;
  database: string;
  clientUser?: string;  // Limited client user (for agent/Tauri, defaults to "hands")
  clientPassword?: string;
}

export class PostgresManager {
  private config: PostgresConfig;
  private process: Subprocess | null = null;
  private _state: ServiceState = "stopped";
  private _lastError?: string;
  private _startedAt?: number;
  private _restartCount = 0;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  /**
   * Admin connection string (for runtime infrastructure)
   */
  get connectionString(): string {
    const { user, password, port, database } = this.config;
    return `postgres://${user}:${password}@localhost:${port}/${database}`;
  }

  /**
   * Client connection string (for agent/Tauri - limited to public schema)
   */
  get clientConnectionString(): string {
    const clientUser = this.config.clientUser || "hands";
    const clientPassword = this.config.clientPassword || "hands";
    const { port, database } = this.config;
    return `postgres://${clientUser}:${clientPassword}@localhost:${port}/${database}`;
  }

  get status(): ServiceStatus {
    return {
      state: this._state,
      up: this._state === "running",
      port: this.config.port,
      pid: this.process?.pid,
      error: this._state === "failed" ? this._lastError : undefined,
      lastError: this._lastError,
      startedAt: this._startedAt,
      restartCount: this._restartCount,
    };
  }

  /**
   * Ensure postgres binaries are available
   */
  async ensureBinaries(): Promise<string> {
    const pgBin = join(PG_BINARIES_DIR, "bin");
    const postgres = join(pgBin, "postgres");

    if (existsSync(postgres)) {
      return pgBin;
    }

    // Download and extract postgres binaries
    console.log(`Downloading PostgreSQL ${PG_VERSION} binaries...`);

    const platform = process.platform;
    // zonkyio uses arm64v8 and amd64 naming convention
    const arch = process.arch === "arm64" ? "arm64v8" : "amd64";

    // Use zonkyio/embedded-postgres-binaries releases
    // https://github.com/zonkyio/embedded-postgres-binaries
    let osName: string;
    if (platform === "darwin") {
      osName = "darwin";
    } else if (platform === "linux") {
      osName = "linux";
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const url = `https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-${osName}-${arch}/${PG_VERSION}/embedded-postgres-binaries-${osName}-${arch}-${PG_VERSION}.jar`;
    console.log(`Downloading from: ${url}`);

    // Download JAR (it's just a zip with postgres binaries inside)
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download postgres binaries: ${response.statusText}`);
    }

    const jarBuffer = await response.arrayBuffer();

    // Create directory
    mkdirSync(PG_BINARIES_DIR, { recursive: true });

    // Extract using unzip (JAR is just a ZIP)
    const jarPath = join(PG_BINARIES_DIR, "postgres.jar");
    await Bun.write(jarPath, jarBuffer);

    // Extract the txz file from the JAR
    const unzipProc = spawn(["unzip", "-o", jarPath, "-d", PG_BINARIES_DIR], {
      cwd: PG_BINARIES_DIR,
      stdout: "inherit",
      stderr: "inherit",
    });
    await unzipProc.exited;

    // Find and extract the .txz file (naming varies by version/platform)
    const files = readdirSync(PG_BINARIES_DIR);
    const txzFile = files.find(f => f.endsWith(".txz"));

    if (txzFile) {
      console.log(`Extracting ${txzFile}...`);
      const tarProc = spawn(["tar", "-xf", join(PG_BINARIES_DIR, txzFile)], {
        cwd: PG_BINARIES_DIR,
        stdout: "inherit",
        stderr: "inherit",
      });
      await tarProc.exited;
    } else {
      console.log("No .txz file found, files in dir:", files);
    }

    // Make binaries executable (minimal binaries: postgres, initdb, pg_ctl)
    const binaries = ["postgres", "initdb", "pg_ctl"];
    for (const bin of binaries) {
      const binPath = join(pgBin, bin);
      if (existsSync(binPath)) {
        chmodSync(binPath, 0o755);
      }
    }

    console.log(`PostgreSQL ${PG_VERSION} binaries ready at ${pgBin}`);
    return pgBin;
  }

  /**
   * Initialize the data directory if needed
   */
  async initDataDir(pgBin: string): Promise<void> {
    const pgData = this.config.dataDir;
    const pgVersionFile = join(pgData, "PG_VERSION");

    if (existsSync(pgVersionFile)) {
      console.log(`Using existing postgres data at ${pgData}`);
      return;
    }

    console.log(`Initializing postgres data directory at ${pgData}`);
    mkdirSync(pgData, { recursive: true });

    const initdb = join(pgBin, "initdb");
    const proc = spawn([
      initdb,
      "-D", pgData,
      "-U", this.config.user,
      "--auth=trust",
      "--encoding=UTF8",
      "--no-locale",
    ], {
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`initdb failed with exit code ${exitCode}`);
    }

    // Configure pg_hba.conf - use trust for local development
    // This is safe because postgres only listens on localhost
    const pgHba = join(pgData, "pg_hba.conf");
    await Bun.write(pgHba, `
# TYPE  DATABASE        USER            ADDRESS                 METHOD
# Trust all local connections - postgres only listens on localhost
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
`);

    // Configure postgresql.conf
    const pgConf = join(pgData, "postgresql.conf");
    const existingConf = await Bun.file(pgConf).text();
    await Bun.write(pgConf, existingConf + `
# Hands runtime configuration
port = ${this.config.port}
listen_addresses = 'localhost'
max_connections = 20
shared_buffers = 128MB
`);
  }

  /**
   * Start the postgres server
   */
  async start(): Promise<void> {
    if (this.process && this._state === "running") {
      console.log("Postgres already running");
      return;
    }

    this._state = "starting";

    try {
      const pgBin = await this.ensureBinaries();
      await this.initDataDir(pgBin);

      const postgres = join(pgBin, "postgres");
      const pgData = this.config.dataDir;

      console.log(`Starting postgres on port ${this.config.port}...`);

      this.process = spawn([
        postgres,
        "-D", pgData,
        "-p", String(this.config.port),
      ], {
        stdout: "inherit",
        stderr: "inherit",
      });

      // Wait for postgres to be ready
      await this.waitForReady(pgBin);

      // Create the database if it doesn't exist
      await this.ensureDatabase();

      // Setup admin and client users with proper permissions
      await this.setupUsers();

      this._state = "running";
      this._startedAt = Date.now();
      console.log(`Postgres ready on port ${this.config.port}`);
    } catch (error) {
      this._state = "failed";
      this._lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async waitForReady(pgBin: string, maxAttempts = 30): Promise<void> {
    // Use pg_ctl status to check if postgres is ready (pg_isready not included in minimal binaries)
    const pgCtl = join(pgBin, "pg_ctl");

    for (let i = 0; i < maxAttempts; i++) {
      const proc = spawn([
        pgCtl,
        "status",
        "-D", this.config.dataDir,
      ], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        // pg_ctl status returns 0 if server is running
        // Give it a moment more to accept connections
        await Bun.sleep(200);
        return;
      }

      await Bun.sleep(500);
    }

    throw new Error("Postgres failed to start within timeout");
  }

  private async ensureDatabase(): Promise<void> {
    // Connect via localhost (trust auth configured in pg_hba.conf)
    const postgres = await import("postgres");
    const sql = postgres.default({
      host: "localhost",
      port: this.config.port,
      user: this.config.user,
      database: "postgres",
    });

    try {
      // Check if database exists
      const result = await sql`SELECT 1 FROM pg_database WHERE datname = ${this.config.database}`;
      if (result.length === 0) {
        // Create database - can't use parameterized query for db name
        await sql.unsafe(`CREATE DATABASE "${this.config.database}"`);
        console.log(`Created database: ${this.config.database}`);
      }
    } catch (err) {
      // Ignore if already exists
      console.log(`Database check/create:`, err);
    } finally {
      await sql.end();
    }
  }

  private async setupUsers(): Promise<void> {
    // Connect via localhost (trust auth configured in pg_hba.conf)
    const postgres = await import("postgres");
    const sql = postgres.default({
      host: "localhost",
      port: this.config.port,
      user: this.config.user,
      database: this.config.database,
    });

    const clientUser = this.config.clientUser || "hands";
    const clientPassword = this.config.clientPassword || "hands";

    try {
      // Set admin password
      await sql.unsafe(`ALTER USER ${this.config.user} WITH PASSWORD '${this.config.password}'`);
      console.log(`Set password for admin user: ${this.config.user}`);

      // Create client user if not exists
      const userExists = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${clientUser}`;
      if (userExists.length === 0) {
        await sql.unsafe(`CREATE USER ${clientUser} WITH PASSWORD '${clientPassword}'`);
        console.log(`Created client user: ${clientUser}`);
      } else {
        await sql.unsafe(`ALTER USER ${clientUser} WITH PASSWORD '${clientPassword}'`);
      }

      // Create internal schema owned by admin
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS _hands AUTHORIZATION ${this.config.user}`);

      // Grant client user full access to public schema (can create tables, etc.)
      await sql.unsafe(`GRANT ALL ON SCHEMA public TO ${clientUser}`);
      await sql.unsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${clientUser}`);
      await sql.unsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${clientUser}`);
      await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${clientUser}`);
      await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${clientUser}`);

      // Explicitly revoke access to internal schema from client
      await sql.unsafe(`REVOKE ALL ON SCHEMA _hands FROM ${clientUser}`);

      // Set client's search_path to only public (can't see _hands)
      await sql.unsafe(`ALTER USER ${clientUser} SET search_path TO public`);

      console.log(`Configured permissions for client user: ${clientUser}`);
    } catch (err) {
      console.error(`Error setting up users:`, err);
    } finally {
      await sql.end();
    }
  }

  /**
   * Stop the postgres server gracefully
   */
  async stop(): Promise<void> {
    if (!this.process) {
      this._state = "stopped";
      return;
    }

    console.log("Stopping postgres...");

    // Send SIGTERM for graceful shutdown
    this.process.kill("SIGTERM");

    // Wait for process to exit (max 10 seconds)
    const timeout = setTimeout(() => {
      this.process?.kill("SIGKILL");
    }, 10000);

    await this.process.exited;
    clearTimeout(timeout);

    this.process = null;
    this._state = "stopped";
    console.log("Postgres stopped");
  }

  /**
   * Restart postgres
   */
  async restart(): Promise<void> {
    this._state = "restarting";
    this._restartCount++;
    await this.stop();
    await this.start();
  }

  /**
   * Switch to a different workbook data directory
   */
  async switchWorkbook(newDataDir: string, newDatabase: string): Promise<void> {
    console.log(`Switching postgres to workbook data: ${newDataDir}`);
    await this.stop();
    this.config.dataDir = newDataDir;
    this.config.database = newDatabase;
    this._restartCount = 0;
    await this.start();
  }
}
