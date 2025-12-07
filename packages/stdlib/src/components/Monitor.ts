export interface MonitorArgs {
  handler: string
  schedule: string
  timeout?: number
  memory?: number
  environment?: Record<string, string>
  link?: unknown[]
}

/**
 * Monitor - Scheduled data jobs
 */
export class Monitor {
  public readonly functionName: string
  public readonly functionArn: string

  constructor(name: string, args: MonitorArgs) {
    this.functionName = `hands-monitor-${name}`
    this.functionArn = `arn:aws:lambda:us-east-1:123456789:function:hands-monitor-${name}`
  }
}
