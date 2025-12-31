/**
 * @hands/services - Cloud Services for Workbooks
 *
 * Provides access to external services (Email, Slack, GitHub, Salesforce)
 * through the Hands cloud API with OAuth authentication.
 *
 * @example
 * ```typescript
 * import { createServices } from "@hands/services";
 *
 * const services = createServices({
 *   cloudUrl: "https://api.hands.app",
 *   authToken: ctx.secrets.HANDS_CLOUD_TOKEN,
 * });
 *
 * await services.email.send({ to: "user@example.com", subject: "Hello", body: "World" });
 * await services.slack.send({ channel: "#alerts", text: "Sync complete!" });
 * ```
 */

// Re-export everything from @hands/core/services
export {
  createServices,
  type EmailInput,
  type EmailResult,
  type GitHubIssue,
  type GitHubRepo,
  type OAuthProvider,
  type SalesforceQueryResult,
  ServiceError,
  type ServiceStatus,
  type Services,
  type ServicesConfig,
  type SlackChannel,
  type SlackInput,
  type SlackResult,
} from "@hands/core/services";
