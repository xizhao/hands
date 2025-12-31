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

export { createNotificationSender, sendSlackMessage, sendSlackWebhook } from "./client";
export { notificationsRouter } from "./router";
export * from "./types";
