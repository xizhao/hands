import type { AlertLevel, NotificationsEnv, SlackMessage, SlackResponse } from "./types";

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: ":information_source:",
  warning: ":warning:",
  error: ":x:",
  success: ":white_check_mark:",
};

const _LEVEL_COLOR: Record<AlertLevel, string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  error: "#ef4444",
  success: "#22c55e",
};

/**
 * Send a message to Slack via webhook
 */
export async function sendSlackWebhook(
  webhookUrl: string,
  message: SlackMessage,
): Promise<SlackResponse> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Slack webhook error:", error);
    return { ok: false, error };
  }

  return { ok: true };
}

/**
 * Send a message to Slack via Bot API (for more control)
 */
export async function sendSlackMessage(
  token: string,
  channel: string,
  message: SlackMessage,
): Promise<SlackResponse> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      ...message,
    }),
  });

  const data = (await response.json()) as SlackResponse;

  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }

  return data;
}

/**
 * High-level notification sender
 */
export function createNotificationSender(env: NotificationsEnv) {
  return {
    /**
     * Send a simple text alert
     */
    alert: async (level: AlertLevel, title: string, message: string) => {
      if (!env.SLACK_WEBHOOK_URL) {
        console.warn("SLACK_WEBHOOK_URL not configured, skipping notification");
        return { ok: false, error: "Not configured" };
      }

      return sendSlackWebhook(env.SLACK_WEBHOOK_URL, {
        text: `${LEVEL_EMOJI[level]} ${title}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `${LEVEL_EMOJI[level]} ${title}`, emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: message },
          },
        ],
      });
    },

    /**
     * Send a user event notification (signup, upgrade, etc.)
     */
    userEvent: async (event: string, user: { email: string; name?: string }) => {
      if (!env.SLACK_WEBHOOK_URL) return { ok: false, error: "Not configured" };

      return sendSlackWebhook(env.SLACK_WEBHOOK_URL, {
        text: `${event}: ${user.email}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${event}*\n${user.name ?? "User"} (${user.email})`,
            },
          },
        ],
      });
    },

    /**
     * Send a system alert (errors, warnings)
     */
    systemAlert: async (title: string, details: Record<string, string>) => {
      if (!env.SLACK_WEBHOOK_URL) return { ok: false, error: "Not configured" };

      const fields = Object.entries(details).map(([key, value]) => ({
        type: "mrkdwn" as const,
        text: `*${key}:*\n${value}`,
      }));

      return sendSlackWebhook(env.SLACK_WEBHOOK_URL, {
        text: `System Alert: ${title}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `:rotating_light: ${title}`, emoji: true },
          },
          {
            type: "section",
            fields,
          },
        ],
      });
    },

    /**
     * Raw webhook send
     */
    raw: (message: SlackMessage) => {
      if (!env.SLACK_WEBHOOK_URL) return Promise.resolve({ ok: false, error: "Not configured" });
      return sendSlackWebhook(env.SLACK_WEBHOOK_URL, message);
    },
  };
}
