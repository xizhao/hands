import type { TemplateData } from "./types";

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const buttonStyles = `
  display: inline-block;
  background: #000;
  color: #fff;
  padding: 12px 24px;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
`;

function wrap(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="${baseStyles}">
  ${content}
  <p style="margin-top: 40px; color: #666; font-size: 14px;">
    — The Hands Team
  </p>
</body>
</html>
  `.trim();
}

export const templates = {
  welcome: (data: TemplateData["welcome"]) => ({
    subject: "Welcome to Hands",
    html: wrap(`
      <h1 style="font-size: 24px; margin-bottom: 20px;">Welcome, ${data.name}!</h1>
      <p>Thanks for joining Hands. You're all set to start building.</p>
      <p style="margin-top: 24px;">
        <a href="https://hands.app/docs" style="${buttonStyles}">Get Started</a>
      </p>
    `),
    text: `Welcome, ${data.name}!\n\nThanks for joining Hands. You're all set to start building.\n\nGet started: https://hands.app/docs`,
  }),

  usage_alert: (data: TemplateData["usage_alert"]) => ({
    subject: `You've used ${data.percentage}% of your monthly quota`,
    html: wrap(`
      <h1 style="font-size: 24px; margin-bottom: 20px;">Usage Alert</h1>
      <p>Hey ${data.name},</p>
      <p>You've used <strong>${data.percentage}%</strong> of your monthly token quota on the <strong>${data.plan}</strong> plan.</p>
      ${data.percentage >= 100
        ? `<p style="color: #dc2626;">You've hit your limit. Upgrade to continue using Hands.</p>`
        : `<p>Consider upgrading if you need more capacity.</p>`
      }
      <p style="margin-top: 24px;">
        <a href="https://hands.app/settings/billing" style="${buttonStyles}">Manage Plan</a>
      </p>
    `),
    text: `Usage Alert\n\nHey ${data.name},\n\nYou've used ${data.percentage}% of your monthly token quota on the ${data.plan} plan.\n\nManage your plan: https://hands.app/settings/billing`,
  }),

  payment_failed: (data: TemplateData["payment_failed"]) => ({
    subject: "Payment failed - action required",
    html: wrap(`
      <h1 style="font-size: 24px; margin-bottom: 20px;">Payment Failed</h1>
      <p>Hey ${data.name},</p>
      <p>We couldn't process your payment of <strong>${data.amount}</strong>.</p>
      <p>Please update your payment method to continue using Hands Pro features.</p>
      <p style="margin-top: 24px;">
        <a href="https://hands.app/settings/billing" style="${buttonStyles}">Update Payment</a>
      </p>
    `),
    text: `Payment Failed\n\nHey ${data.name},\n\nWe couldn't process your payment of ${data.amount}.\n\nUpdate payment: https://hands.app/settings/billing`,
  }),

  subscription_canceled: (data: TemplateData["subscription_canceled"]) => ({
    subject: "Your subscription has been canceled",
    html: wrap(`
      <h1 style="font-size: 24px; margin-bottom: 20px;">Subscription Canceled</h1>
      <p>Hey ${data.name},</p>
      <p>Your Hands subscription has been canceled. You'll have access to Pro features until <strong>${data.endDate}</strong>.</p>
      <p>After that, your account will revert to the free plan.</p>
      <p>Changed your mind? You can resubscribe anytime.</p>
      <p style="margin-top: 24px;">
        <a href="https://hands.app/settings/billing" style="${buttonStyles}">Resubscribe</a>
      </p>
    `),
    text: `Subscription Canceled\n\nHey ${data.name},\n\nYour subscription has been canceled. You'll have Pro access until ${data.endDate}.\n\nResubscribe: https://hands.app/settings/billing`,
  }),
};
