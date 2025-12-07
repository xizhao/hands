export interface DataStoreArgs {
  engine?: "postgres"
  storage?: number
  instance?: string
  publicAccess?: boolean
}

export interface DataStoreOutput {
  connectionString: string
  host: string
  port: number
  database: string
}

/**
 * DataStore - Embedded Postgres for data apps
 */
export class DataStore {
  public readonly connectionString: string
  public readonly host: string
  public readonly port: number
  public readonly database: string

  constructor(name: string, args?: DataStoreArgs) {
    // TODO: Implement with actual SST/Pulumi resources
    this.connectionString = "postgresql://localhost:5432/hands"
    this.host = "localhost"
    this.port = 5432
    this.database = "hands"
  }
}
