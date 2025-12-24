/**
 * Notifications Service
 *
 * Slack-powered alerts and notifications.
 *
 * Usage:
 *   cloud.notifications.alert({ level: "error", title, message })
 *   cloud.notifications.userEvent({ event: "User Signed Up" })
 *   cloud.notifications.systemAlert({ title, details })
 *
 * Direct client usage:
 *   const sender = createNotificationSender(env);
 *   await sender.alert("info", "Title", "Message");
 */

export { notificationsRouter } from "./router";
export { createNotificationSender, sendSlackWebhook, sendSlackMessage } from "./client";
export * from "./types";
