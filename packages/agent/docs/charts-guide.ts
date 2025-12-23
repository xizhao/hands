/**
 * Charts documentation for agents
 *
 * All charts use Vega-Lite for rendering.
 * Two approaches: simplified components or direct Vega-Lite specs.
 */

/**
 * Chart components overview
 */
export const CHARTS_OVERVIEW = `
## Charts

All charts in Hands use Vega-Lite for rendering. Two approaches:

1. **Simplified components** - LineChart, BarChart, PieChart, etc.
2. **Direct Vega-Lite** - \`<Chart vegaSpec={...}>\` for full control

Charts work standalone or inside \`<LiveValue>\` to display query results.
`;

/**
 * Simplified chart components
 */
export const SIMPLE_CHARTS_DOCS = `
## Simplified Chart Components

### LineChart
\`\`\`tsx
<LineChart
  data={data}           // Array of objects (optional if inside LiveValue)
  xKey="date"           // Field for X axis
  yKey="revenue"        // Field for Y axis (or array for multiple lines)
  height={300}          // Height in pixels
  showLegend={false}    // Show legend
  showGrid={true}       // Show grid lines
  showDots={true}       // Show data points
  curve="monotone"      // "linear" | "monotone" | "step"
/>

// Multiple lines
<LineChart xKey="month" yKey={["sales", "expenses"]} showLegend />
\`\`\`

### BarChart
\`\`\`tsx
<BarChart
  data={data}
  xKey="category"       // Categories on X axis
  yKey="value"          // Values on Y axis
  height={300}
  stacked={false}       // Stack multiple series
  layout="vertical"     // "vertical" | "horizontal"
  showLegend={false}
/>

// Stacked bars
<BarChart xKey="month" yKey={["product_a", "product_b"]} stacked />
\`\`\`

### AreaChart
\`\`\`tsx
<AreaChart
  data={data}
  xKey="date"
  yKey="value"
  height={300}
  stacked={false}       // Stack multiple areas
  opacity={0.7}         // Area opacity
/>
\`\`\`

### PieChart
\`\`\`tsx
<PieChart
  data={data}
  categoryKey="segment" // Field for slices
  valueKey="amount"     // Field for slice size
  height={300}
  showLabels={true}     // Show slice labels
  innerRadius={0}       // > 0 for donut chart
/>
\`\`\`

### ScatterChart
\`\`\`tsx
<ScatterChart
  data={data}
  xKey="height"
  yKey="weight"
  sizeKey="age"         // Optional: vary dot size
  colorKey="gender"     // Optional: color by category
  height={300}
/>
\`\`\`

### HistogramChart
\`\`\`tsx
<HistogramChart
  data={data}
  valueKey="score"      // Field to bin
  bins={20}             // Number of bins
  height={300}
/>
\`\`\`

### BoxPlotChart
\`\`\`tsx
<BoxPlotChart
  data={data}
  categoryKey="group"   // Categories
  valueKey="value"      // Values to summarize
  height={300}
/>
\`\`\`

### HeatmapChart
\`\`\`tsx
<HeatmapChart
  data={data}
  xKey="day"
  yKey="hour"
  colorKey="count"      // Field for color intensity
  height={300}
/>
\`\`\`
`;

/**
 * Generic Chart component for custom Vega specs
 */
export const GENERIC_CHART_DOCS = `
## Generic Chart Component

For advanced visualizations, use \`<Chart>\` with a full Vega-Lite spec:

\`\`\`tsx
<Chart
  vegaSpec={{
    mark: "boxplot",
    encoding: {
      x: { field: "category", type: "nominal" },
      y: { field: "value", type: "quantitative" }
    }
  }}
  height={300}
  data={data}  // Optional if spec includes data
/>
\`\`\`

### Common Vega-Lite Patterns

**Basic bar chart spec:**
\`\`\`tsx
<Chart vegaSpec={{
  mark: "bar",
  encoding: {
    x: { field: "category", type: "nominal" },
    y: { field: "value", type: "quantitative" }
  }
}} />
\`\`\`

**Line chart with temporal axis:**
\`\`\`tsx
<Chart vegaSpec={{
  mark: "line",
  encoding: {
    x: { field: "date", type: "temporal" },
    y: { field: "price", type: "quantitative" }
  }
}} />
\`\`\`

**Heatmap:**
\`\`\`tsx
<Chart vegaSpec={{
  mark: "rect",
  encoding: {
    x: { field: "day", type: "ordinal" },
    y: { field: "hour", type: "ordinal" },
    color: { field: "value", type: "quantitative" }
  }
}} />
\`\`\`

**Layered chart (line + points):**
\`\`\`tsx
<Chart vegaSpec={{
  layer: [
    { mark: "line" },
    { mark: "point" }
  ],
  encoding: {
    x: { field: "date", type: "temporal" },
    y: { field: "value", type: "quantitative" }
  }
}} />
\`\`\`

**Faceted chart (small multiples):**
\`\`\`tsx
<Chart vegaSpec={{
  mark: "line",
  encoding: {
    x: { field: "date", type: "temporal" },
    y: { field: "value", type: "quantitative" },
    facet: { field: "category", type: "nominal", columns: 2 }
  }
}} />
\`\`\`
`;

/**
 * Using charts with LiveValue
 */
export const CHARTS_WITH_LIVEVALUE_DOCS = `
## Charts with LiveValue

Charts automatically use data from \`<LiveValue>\` context:

\`\`\`mdx
<LiveValue query="SELECT date, revenue FROM sales ORDER BY date">
  <LineChart xKey="date" yKey="revenue" />
</LiveValue>
\`\`\`

\`\`\`mdx
<LiveValue query="SELECT category, SUM(amount) as total FROM orders GROUP BY category">
  <BarChart xKey="category" yKey="total" />
</LiveValue>
\`\`\`

\`\`\`mdx
<LiveValue query="SELECT segment, SUM(revenue) as revenue FROM customers GROUP BY segment">
  <PieChart categoryKey="segment" valueKey="revenue" />
</LiveValue>
\`\`\`

### Custom Vega spec with LiveValue:
\`\`\`mdx
<LiveValue query="SELECT day, hour, COUNT(*) as count FROM events GROUP BY day, hour">
  <Chart vegaSpec={{
    mark: "rect",
    encoding: {
      x: { field: "day", type: "ordinal" },
      y: { field: "hour", type: "ordinal" },
      color: { field: "count", type: "quantitative", scale: { scheme: "blues" } }
    }
  }} />
</LiveValue>
\`\`\`
`;

/**
 * Vega-Lite reference for common field types
 */
export const VEGA_FIELD_TYPES_DOCS = `
## Vega-Lite Field Types

When writing \`vegaSpec\`, use these types:

| Type | Use for | Example |
|------|---------|---------|
| \`quantitative\` | Numbers | revenue, count, price |
| \`nominal\` | Categories (unordered) | product_name, country |
| \`ordinal\` | Categories (ordered) | size (S/M/L), rating (1-5) |
| \`temporal\` | Dates/times | created_at, date |

### Aggregations

\`\`\`tsx
encoding: {
  y: {
    field: "amount",
    type: "quantitative",
    aggregate: "sum"  // sum, mean, median, min, max, count
  }
}
\`\`\`

### Formatting

\`\`\`tsx
encoding: {
  x: {
    field: "date",
    type: "temporal",
    axis: { format: "%b %Y" }  // Jan 2024
  },
  y: {
    field: "revenue",
    type: "quantitative",
    axis: { format: "$,.0f" }  // $1,234
  }
}
\`\`\`

### Color scales

\`\`\`tsx
encoding: {
  color: {
    field: "category",
    type: "nominal",
    scale: { scheme: "category10" }  // Categorical
  }
}

// For continuous:
color: {
  field: "value",
  type: "quantitative",
  scale: { scheme: "blues" }  // viridis, reds, greens, etc.
}
\`\`\`
`;

/**
 * Chart selection guide
 */
export const CHART_SELECTION_GUIDE = `
## Choosing the Right Chart

| Data Pattern | Best Chart | Example |
|--------------|------------|---------|
| Trend over time | LineChart | Revenue by month |
| Category comparison | BarChart | Sales by product |
| Part of whole | PieChart | Market share |
| Correlation | ScatterChart | Height vs weight |
| Distribution | HistogramChart | Age distribution |
| Statistical summary | BoxPlotChart | Salary by department |
| 2D density | HeatmapChart | Activity by day/hour |

### When to use \`<Chart vegaSpec>\`:
- Complex multi-layer charts
- Unusual mark types (boxplot, violin, etc.)
- Custom transforms or calculations
- Faceted/small multiples
- Anything beyond simple X/Y encoding
`;

/**
 * Minimal charts reference for non-technical agents (Hands)
 * Just enough to know what's possible and delegate effectively
 */
export const HANDS_CHARTS_QUICK_REF = `
## Charts in MDX Pages

Charts display data from queries. Wrap them in \`<LiveValue>\`:

\`\`\`mdx
<LiveValue query="SELECT date, revenue FROM sales ORDER BY date">
  <LineChart xKey="date" yKey="revenue" />
</LiveValue>

<LiveValue query="SELECT category, SUM(amount) as total FROM orders GROUP BY category">
  <BarChart xKey="category" yKey="total" />
</LiveValue>

<LiveValue query="SELECT segment, SUM(revenue) as revenue FROM customers GROUP BY segment">
  <PieChart categoryKey="segment" valueKey="revenue" />
</LiveValue>
\`\`\`

**Available charts:** LineChart, BarChart, AreaChart, PieChart, ScatterChart, HistogramChart, HeatmapChart

**When to use which:**
- Trend over time → LineChart
- Compare categories → BarChart
- Part of whole → PieChart
- Correlation → ScatterChart

For complex visualizations (interactive, animated, custom), delegate to @coder.
`;
