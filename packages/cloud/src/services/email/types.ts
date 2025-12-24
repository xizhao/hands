export interface EmailEnv {
  AWS_SES_ACCESS_KEY: string;
  AWS_SES_SECRET_KEY: string;
  AWS_SES_REGION?: string;
  EMAIL_FROM?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailResult {
  messageId: string;
  success: boolean;
}

export type EmailTemplate =
  | "welcome"
  | "usage_alert"
  | "payment_failed"
  | "subscription_canceled";

export interface TemplateData {
  welcome: { name: string };
  usage_alert: { name: string; percentage: number; plan: string };
  payment_failed: { name: string; amount: string };
  subscription_canceled: { name: string; endDate: string };
}
