export interface IntegrationArgs {
  handler: string
  type: "webhook" | "polling" | "stream"
  schedule?: string
  path?: string
  environment?: Record<string, string>
  link?: unknown[]
}

/**
 * Integration - External data source connectors
 */
export class Integration {
  public readonly url: string
  public readonly functionName: string

  constructor(name: string, args: IntegrationArgs) {
    this.url = `https://integrations.example.com/${args.path || name}`
    this.functionName = `hands-integration-${name}`
  }
}
