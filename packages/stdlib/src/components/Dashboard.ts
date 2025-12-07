export interface DashboardArgs {
  handler: string
  title: string
  domain?: string
  auth?: boolean
  link?: unknown[]
}

/**
 * Dashboard - Serverless dashboard hosting
 */
export class Dashboard {
  public readonly url: string
  public readonly functionName: string

  constructor(name: string, args: DashboardArgs) {
    this.url = `https://${name}.example.com`
    this.functionName = `hands-dashboard-${name}`
  }
}
