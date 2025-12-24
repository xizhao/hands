export interface NotificationsEnv {
  SLACK_WEBHOOK_URL?: string;
  SLACK_BOT_TOKEN?: string;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export interface SlackBlock {
  type: "section" | "header" | "divider" | "context" | "actions";
  text?: {
    type: "plain_text" | "mrkdwn";
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: "plain_text" | "mrkdwn";
    text: string;
  }>;
  elements?: Array<{
    type: "button" | "image";
    text?: { type: "plain_text"; text: string };
    url?: string;
    action_id?: string;
    image_url?: string;
    alt_text?: string;
  }>;
}

export interface SlackResponse {
  ok: boolean;
  error?: string;
  ts?: string;
}

export type AlertLevel = "info" | "warning" | "error" | "success";
