// Charts - Data visualizations and queries
// Define your chart configurations here

export interface Chart {
  id: string;
  title: string;
  type: "line" | "bar" | "pie" | "area" | "table";
  query: string;
  description?: string;
}

export const charts: Chart[] = [
  // Example chart configuration:
  // {
  //   id: "daily-events",
  //   title: "Daily Events",
  //   type: "line",
  //   query: `
  //     SELECT
  //       date(created_at) as date,
  //       count(*) as value
  //     FROM events
  //     GROUP BY 1
  //     ORDER BY 1
  //   `,
  // },
];

export default charts;
