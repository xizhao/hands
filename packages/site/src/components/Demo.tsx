import { Editor } from "@hands/editor";
import { useState } from "react";

const TEMPLATES = {
  revops: `# Revenue Operations Dashboard

<Columns>
  <LiveValue query="SELECT ROUND(SUM(amount) / 1000, 0) as value FROM deals WHERE status = 'closed_won' AND close_date >= date('now', '-30 days')" label="MRR" format="$%sk" />
  <LiveValue query="SELECT ROUND(SUM(amount) / 1000, 0) as value FROM deals WHERE status = 'open'" label="Pipeline" format="$%sk" />
  <LiveValue query="SELECT ROUND(AVG(win_rate) * 100, 0) as value FROM sales_metrics WHERE month >= date('now', '-90 days')" label="Win Rate" format="%s%" />
  <LiveValue query="SELECT ROUND(AVG(sales_cycle_days), 0) as value FROM deals WHERE status = 'closed_won'" label="Avg Cycle" format="%s days" />
</Columns>

## Revenue by Month

<LiveValue query="SELECT month, revenue, target FROM revenue_monthly ORDER BY month">
  <AreaChart xKey="month" yKey="revenue" targetKey="target" />
</LiveValue>

## Pipeline by Stage

<LiveValue query="SELECT stage, COUNT(*) as count, SUM(amount) as value FROM deals WHERE status = 'open' GROUP BY stage ORDER BY CASE stage WHEN 'Discovery' THEN 1 WHEN 'Proposal' THEN 2 WHEN 'Negotiation' THEN 3 WHEN 'Contract' THEN 4 END">
  <BarChart xKey="stage" yKey="value" />
</LiveValue>

---

## Top Deals This Quarter

<LiveValue query="SELECT company, owner, stage, amount, close_date, probability FROM deals WHERE status = 'open' ORDER BY amount DESC LIMIT 8">
  <DataTable columns={["company", "owner", "stage", "amount", "close_date", "probability"]} />
</LiveValue>

## Sales Rep Performance

<LiveValue query="SELECT rep_name, closed_revenue, quota, ROUND(closed_revenue * 100.0 / quota, 0) as attainment FROM rep_performance ORDER BY attainment DESC">
  <DataTable columns={["rep_name", "closed_revenue", "quota", "attainment"]} />
</LiveValue>
`,

  survey: `# Weekly Team Check-In

Complete this quick pulse survey to help us improve.

---

<Form onSubmit="INSERT INTO survey_responses (submitted_at, mood, workload, blockers, wins, suggestions) VALUES (datetime('now'), :mood, :workload, :blockers, :wins, :suggestions)">

## How are you feeling this week?

<RadioGroup name="mood" options={[
  { value: "great", label: "😀 Great" },
  { value: "good", label: "🙂 Good" },
  { value: "okay", label: "😐 Okay" },
  { value: "stressed", label: "😓 Stressed" },
  { value: "burned_out", label: "😫 Burned Out" }
]} />

## Rate your workload (1-5)

<Slider name="workload" min={1} max={5} labels={["Light", "Balanced", "Heavy"]} />

## Any blockers this week?

<TextArea name="blockers" placeholder="What's slowing you down? Leave blank if none." rows={3} />

## Wins to celebrate?

<TextArea name="wins" placeholder="Share something that went well!" rows={2} />

## Suggestions for the team

<TextArea name="suggestions" placeholder="Ideas to improve how we work..." rows={2} optional />

<SubmitButton>Submit Check-In</SubmitButton>

</Form>

---

*Responses are anonymous. Results shared in Friday standup.*
`,

  alerts: `# Operations Alert Center

<Columns>
  <LiveValue query="SELECT COUNT(*) as value FROM alerts WHERE status = 'active' AND severity = 'critical'" label="Critical" />
  <LiveValue query="SELECT COUNT(*) as value FROM alerts WHERE status = 'active' AND severity = 'warning'" label="Warnings" />
  <LiveValue query="SELECT ROUND(AVG(uptime_pct), 1) as value FROM system_health WHERE timestamp >= datetime('now', '-24 hours')" label="Uptime 24h" format="%s%" />
  <LiveValue query="SELECT COUNT(*) as value FROM alerts WHERE status = 'resolved' AND resolved_at >= datetime('now', '-24 hours')" label="Resolved Today" />
</Columns>

## Active Alerts

<LiveValue query="SELECT severity, system, message, triggered_at, acknowledged_by FROM alerts WHERE status = 'active' ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, triggered_at DESC">
  <DataTable columns={["severity", "system", "message", "triggered_at", "acknowledged_by"]} />
</LiveValue>

---

## 🚨 API Latency Spike Detected

**System:** payments-api
**Triggered:** 2 minutes ago
**P95 Latency:** 2,450ms (threshold: 500ms)

<LiveValue query="SELECT timestamp, latency_p95 FROM api_metrics WHERE system = 'payments-api' ORDER BY timestamp DESC LIMIT 20">
  <LineChart xKey="timestamp" yKey="latency_p95" threshold={500} color="red" />
</LiveValue>

### Alert Rules

<Callout type="info">
When latency exceeds threshold for 5 minutes:
1. Page on-call engineer via PagerDuty
2. Post to #incidents Slack channel
3. Scale up API pods automatically
</Callout>

<LiveAction query="UPDATE alerts SET status = 'acknowledged', acknowledged_by = 'current_user' WHERE id = :alert_id">
  <ActionButton variant="primary">Acknowledge Alert</ActionButton>
</LiveAction>

<LiveAction query="INSERT INTO incident_notes (alert_id, note, created_by) VALUES (:alert_id, :note, 'current_user')">
  <ActionInput name="note" placeholder="Add investigation note..." />
  <ActionButton>Add Note</ActionButton>
</LiveAction>
`,

  onboarding: `# Customer Onboarding: Acme Corp

<Columns>
  <LiveValue query="SELECT ROUND(completed * 100.0 / total, 0) as value FROM onboarding_progress WHERE customer_id = 1" label="Progress" format="%s%" />
  <LiveValue query="SELECT days_elapsed as value FROM onboarding_progress WHERE customer_id = 1" label="Day" format="Day %s" />
  <LiveValue query="SELECT target_go_live as value FROM customers WHERE id = 1" label="Go-Live" />
  <LiveValue query="SELECT csm_name as value FROM customers WHERE id = 1" label="CSM" />
</Columns>

## Onboarding Checklist

<LiveValue query="SELECT phase, task, owner, status, due_date, completed_at FROM onboarding_tasks WHERE customer_id = 1 ORDER BY CASE phase WHEN 'Setup' THEN 1 WHEN 'Integration' THEN 2 WHEN 'Training' THEN 3 WHEN 'Go-Live' THEN 4 END, due_date">
  <Checklist
    groupBy="phase"
    columns={["task", "owner", "status", "due_date"]}
    onToggle="UPDATE onboarding_tasks SET status = :status, completed_at = CASE WHEN :status = 'done' THEN datetime('now') ELSE NULL END WHERE id = :id"
  />
</LiveValue>

---

## Automations Active

<Callout type="success">
**Task assigned** → Slack DM to owner
**Phase complete** → Email customer + CSM
**Overdue task** → Escalate to CSM manager
**Go-live reached** → Trigger celebration workflow 🎉
</Callout>

## Add Custom Task

<LiveAction query="INSERT INTO onboarding_tasks (customer_id, phase, task, owner, status, due_date) VALUES (1, :phase, :task, :owner, 'pending', :due_date)">
  <ActionSelect name="phase" options={[
    { value: "Setup", label: "Setup" },
    { value: "Integration", label: "Integration" },
    { value: "Training", label: "Training" },
    { value: "Go-Live", label: "Go-Live" }
  ]} />
  <ActionInput name="task" placeholder="Task description" />
  <ActionInput name="owner" placeholder="Assignee" />
  <ActionInput name="due_date" type="date" />
  <ActionButton>Add Task</ActionButton>
</LiveAction>

## Notes

<LiveValue query="SELECT note, created_by, created_at FROM customer_notes WHERE customer_id = 1 ORDER BY created_at DESC LIMIT 5">
  <DataTable columns={["note", "created_by", "created_at"]} />
</LiveValue>
`,
};

type TemplateId = keyof typeof TEMPLATES;

interface TemplateTab {
  id: TemplateId;
  label: string;
  icon: "chart" | "clipboard" | "bell" | "rocket";
  prompt: string;
}

const TEMPLATE_TABS: TemplateTab[] = [
  { id: "revops", label: "Sales Dashboard", icon: "chart", prompt: "Show me revenue trends and pipeline" },
  { id: "survey", label: "Team Survey", icon: "clipboard", prompt: "Create a weekly team check-in form" },
  { id: "alerts", label: "Alert Center", icon: "bell", prompt: "Alert me when latency spikes" },
  { id: "onboarding", label: "Onboarding", icon: "rocket", prompt: "Track customer onboarding progress" },
];

export function Demo() {
  const [activeTab, setActiveTab] = useState<TemplateId>("revops");
  const [contents, setContents] = useState<Record<TemplateId, string>>(TEMPLATES);

  const handleChange = (value: string) => {
    setContents((prev) => ({ ...prev, [activeTab]: value }));
  };

  const getIcon = (icon: TemplateTab["icon"]) => {
    switch (icon) {
      case "chart": return <ChartIcon className="w-3.5 h-3.5" />;
      case "clipboard": return <ClipboardIcon className="w-3.5 h-3.5" />;
      case "bell": return <BellIcon className="w-3.5 h-3.5" />;
      case "rocket": return <RocketIcon className="w-3.5 h-3.5" />;
    }
  };

  const currentTab = TEMPLATE_TABS.find(t => t.id === activeTab)!;

  return (
    <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-border">
      {/* Tab Bar */}
      <div className="h-10 bg-muted flex items-end px-2 gap-0.5">
        {/* Template Tabs */}
        {TEMPLATE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-background/95 backdrop-blur text-foreground border-t border-x border-border"
                : "text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {getIcon(tab.icon)}
            <span>{tab.label}</span>
          </button>
        ))}
        {/* Add new tab button */}
        <button className="flex items-center justify-center w-8 h-8 rounded-t-lg text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Prompt badge */}
      <div className="px-4 py-2 bg-background border-b border-border/50 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Prompt:</span>
        <span className="text-xs text-foreground font-medium">&ldquo;{currentTab.prompt}&rdquo;</span>
      </div>

      {/* Editor Content - zoomed out for preview effect */}
      <div className="h-[480px] overflow-hidden">
        <div className="origin-top-left scale-[0.85] w-[117.6%] h-[117.6%]">
          <Editor value={contents[activeTab]} onChange={handleChange} className="h-full" />
        </div>
      </div>
    </div>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
