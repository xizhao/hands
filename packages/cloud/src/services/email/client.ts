import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailEnv, EmailResult, SendEmailOptions } from "./types";

export function createSESClient(env: EmailEnv): SESClient {
  return new SESClient({
    region: env.AWS_SES_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: env.AWS_SES_ACCESS_KEY,
      secretAccessKey: env.AWS_SES_SECRET_KEY,
    },
  });
}

export async function sendEmail(
  client: SESClient,
  from: string,
  options: SendEmailOptions,
): Promise<EmailResult> {
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

  const command = new SendEmailCommand({
    Source: from,
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: {
        Data: options.subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: options.html,
          Charset: "UTF-8",
        },
        ...(options.text && {
          Text: {
            Data: options.text,
            Charset: "UTF-8",
          },
        }),
      },
    },
    ...(options.replyTo && {
      ReplyToAddresses: [options.replyTo],
    }),
  });

  try {
    const response = await client.send(command);
    return {
      messageId: response.MessageId ?? "",
      success: true,
    };
  } catch (error) {
    console.error("SES send error:", error);
    throw error;
  }
}

/**
 * High-level email sender with environment defaults
 */
export function createEmailSender(env: EmailEnv) {
  const client = createSESClient(env);
  const from = env.EMAIL_FROM ?? "Hands <hello@hands.app>";

  return {
    send: (options: SendEmailOptions) => sendEmail(client, from, options),

    sendTemplate: async <T extends keyof typeof import("./templates").templates>(
      template: T,
      to: string,
      data: Parameters<typeof import("./templates").templates[T]>[0],
    ) => {
      const { templates } = await import("./templates");
      const templateFn = templates[template] as (data: unknown) => {
        subject: string;
        html: string;
        text: string;
      };
      const content = templateFn(data);
      return sendEmail(client, from, { to, ...content });
    },
  };
}
