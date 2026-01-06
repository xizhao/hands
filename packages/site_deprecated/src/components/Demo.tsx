import { Editor } from "@hands/editor";
import { useState } from "react";

const TEMPLATES = {
  revops: `# Revenue Operations Dashboard

<LiveValue query="SELECT ROUND(SUM(amount) / 1000, 0) as value FROM deals WHERE status = 'closed_won'" />

## Revenue by Month

<LiveValue query="SELECT month, revenue FROM revenue_monthly ORDER BY month">
  <AreaChart xKey="month" yKey="revenue" />
</LiveValue>

## Pipeline by Stage

<LiveValue query="SELECT stage, SUM(amount) as value FROM deals WHERE status = 'open' GROUP BY stage ORDER BY value DESC">
  <BarChart xKey="stage" yKey="value" />
</LiveValue>

---

## Top Deals This Quarter

<LiveValue query="SELECT company, owner, stage, amount, close_date FROM deals WHERE status = 'open' ORDER BY amount DESC LIMIT 8" display="table" />

## Sales Rep Performance

<LiveValue query="SELECT rep_name, closed_revenue, quota FROM rep_performance ORDER BY closed_revenue DESC" display="table" />
`,

  survey: `# Weekly Team Check-In

Complete this quick pulse survey to help us improve.

---

<LiveAction sql="INSERT INTO survey_responses (submitted_at, mood, blockers, wins) VALUES (datetime('now'), {{mood}}, {{blockers}}, {{wins}})">

## How are you feeling this week?

<Select name="mood" options={[
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "stressed", label: "Stressed" }
]} />

## Any blockers this week?

<Textarea name="blockers" placeholder="What's slowing you down?" rows={3} />

## Wins to celebrate?

<Textarea name="wins" placeholder="Share something that went well!" rows={2} />

<Button>Submit Check-In</Button>

</LiveAction>

---

*Responses are anonymous. Results shared in Friday standup.*
`,

  alerts: `# Operations Alert Center

<LiveValue query="SELECT COUNT(*) as value FROM alerts WHERE status = 'active' AND severity = 'critical'" />

## Active Alerts

<LiveValue query="SELECT severity, system, message, triggered_at FROM alerts WHERE status = 'active' ORDER BY triggered_at DESC" display="table" />

---

## API Latency Trend

<LiveValue query="SELECT timestamp, latency_p95 FROM api_metrics WHERE system = 'payments-api' ORDER BY timestamp DESC LIMIT 20">
  <LineChart xKey="timestamp" yKey="latency_p95" />
</LiveValue>

<Alert variant="warning">
When latency exceeds threshold for 5 minutes, on-call is paged automatically.
</Alert>

<LiveAction sql="UPDATE alerts SET status = 'acknowledged' WHERE id = {{alertId}}">
  <Input name="alertId" placeholder="Alert ID" />
  <Button>Acknowledge Alert</Button>
</LiveAction>
`,

  onboarding: `# Customer Onboarding: Acme Corp

<LiveValue query="SELECT ROUND(completed * 100.0 / total, 0) as value FROM onboarding_progress WHERE customer_id = 1" />

## Onboarding Tasks

<LiveValue query="SELECT phase, task, owner, status, due_date FROM onboarding_tasks WHERE customer_id = 1 ORDER BY due_date" display="table" />

---

<Alert variant="success">
Automations: Task assigned → Slack DM, Phase complete → Email, Overdue → Escalate
</Alert>

## Add Custom Task

<LiveAction sql="INSERT INTO onboarding_tasks (customer_id, phase, task, owner, status, due_date) VALUES (1, {{phase}}, {{task}}, {{owner}}, 'pending', {{dueDate}})">
  <Select name="phase" options={[
    { value: "Setup", label: "Setup" },
    { value: "Integration", label: "Integration" },
    { value: "Training", label: "Training" },
    { value: "Go-Live", label: "Go-Live" }
  ]} />
  <Input name="task" placeholder="Task description" />
  <Input name="owner" placeholder="Assignee" />
  <Input name="dueDate" placeholder="Due date (YYYY-MM-DD)" />
  <Button>Add Task</Button>
</LiveAction>

## Recent Notes

<LiveValue query="SELECT note, created_by, created_at FROM customer_notes WHERE customer_id = 1 ORDER BY created_at DESC LIMIT 5" display="table" />
`,
};

type TemplateId = keyof typeof TEMPLATES;

interface TemplateTab {
  id: TemplateId;
  label: string;
  icon: "chart" | "clipboard" | "bell" | "rocket";
}

const TEMPLATE_TABS: TemplateTab[] = [
  { id: "revops", label: "Sales Dashboard", icon: "chart" },
  { id: "survey", label: "Team Survey", icon: "clipboard" },
  { id: "alerts", label: "Alert Center", icon: "bell" },
  { id: "onboarding", label: "Onboarding", icon: "rocket" },
];

export function Demo() {
  const [activeTab, setActiveTab] = useState<TemplateId>("revops");
  const [contents, setContents] = useState<Record<TemplateId, string>>(TEMPLATES);

  const handleChange = (value: string) => {
    setContents((prev) => ({ ...prev, [activeTab]: value }));
  };

  const getIcon = (icon: TemplateTab["icon"]) => {
    switch (icon) {
      case "chart":
        return <ChartIcon className="w-3.5 h-3.5" />;
      case "clipboard":
        return <ClipboardIcon className="w-3.5 h-3.5" />;
      case "bell":
        return <BellIcon className="w-3.5 h-3.5" />;
      case "rocket":
        return <RocketIcon className="w-3.5 h-3.5" />;
    }
  };

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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
