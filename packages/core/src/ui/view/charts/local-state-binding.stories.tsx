import type { Story } from "@ladle/react";
import { useState } from "react";
import { LocalStateProvider, useLocalState } from "../../local-state";
import { Select } from "../../action/select";
import { BarChart } from "./bar-chart";
import { LineChart } from "./line-chart";
import { PieChart } from "./pie-chart";

export default {
  title: "Integration/LocalState Binding",
};

// Simple Slider component that writes to LocalState
function Slider({
  name,
  min,
  max,
  step = 1,
  label,
}: {
  name: string;
  min: number;
  max: number;
  step?: number;
  label?: string;
}) {
  const localState = useLocalState();
  const currentValue = (localState?.values[name] as number) ?? min;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    localState?.setValue(name, val);
  };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium">
          {label}: <span className="font-bold">{currentValue}</span>
        </label>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        className="w-64 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}

// Sample data with multiple years for animation/filtering
const salesByYear = [
  // 2021
  { year: 2021, month: "Jan", revenue: 4000 },
  { year: 2021, month: "Feb", revenue: 3000 },
  { year: 2021, month: "Mar", revenue: 5000 },
  { year: 2021, month: "Apr", revenue: 4500 },
  { year: 2021, month: "May", revenue: 6000 },
  { year: 2021, month: "Jun", revenue: 5500 },
  // 2022
  { year: 2022, month: "Jan", revenue: 4200 },
  { year: 2022, month: "Feb", revenue: 3800 },
  { year: 2022, month: "Mar", revenue: 5200 },
  { year: 2022, month: "Apr", revenue: 4900 },
  { year: 2022, month: "May", revenue: 6500 },
  { year: 2022, month: "Jun", revenue: 6200 },
  // 2023
  { year: 2023, month: "Jan", revenue: 5000 },
  { year: 2023, month: "Feb", revenue: 4500 },
  { year: 2023, month: "Mar", revenue: 6000 },
  { year: 2023, month: "Apr", revenue: 5800 },
  { year: 2023, month: "May", revenue: 7500 },
  { year: 2023, month: "Jun", revenue: 7200 },
];

const categoryByRegion = [
  // North
  { region: "North", category: "Electronics", sales: 12000 },
  { region: "North", category: "Clothing", sales: 8000 },
  { region: "North", category: "Food", sales: 15000 },
  // South
  { region: "South", category: "Electronics", sales: 9000 },
  { region: "South", category: "Clothing", sales: 11000 },
  { region: "South", category: "Food", sales: 13000 },
  // East
  { region: "East", category: "Electronics", sales: 14000 },
  { region: "East", category: "Clothing", sales: 7000 },
  { region: "East", category: "Food", sales: 10000 },
  // West
  { region: "West", category: "Electronics", sales: 11000 },
  { region: "West", category: "Clothing", sales: 9500 },
  { region: "West", category: "Food", sales: 12500 },
];

const yearOptions = [
  { value: "2021", label: "2021" },
  { value: "2022", label: "2022" },
  { value: "2023", label: "2023" },
];

const regionOptions = [
  { value: "North", label: "North" },
  { value: "South", label: "South" },
  { value: "East", label: "East" },
  { value: "West", label: "West" },
];

/**
 * Select a year to filter the bar chart data.
 * The Select writes to LocalState, and the BarChart reads via frameValue="{{year}}"
 */
export const SelectControlsBarChart: Story = () => (
  <LocalStateProvider defaults={{ year: "2022" }}>
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select name="year" label="Select Year" options={yearOptions} defaultValue="2022" />
      </div>
      <BarChart
        data={salesByYear}
        xKey="month"
        yKey="revenue"
        height={300}
        animateBy="year"
        frameValue="{{year}}"
      />
    </div>
  </LocalStateProvider>
);

/**
 * Select a region to filter the pie chart data.
 */
export const SelectControlsPieChart: Story = () => (
  <LocalStateProvider defaults={{ region: "North" }}>
    <div className="space-y-4">
      <Select name="region" label="Select Region" options={regionOptions} defaultValue="North" />
      <PieChart
        data={categoryByRegion}
        nameKey="category"
        valueKey="sales"
        height={300}
        animateBy="region"
        frameValue="{{region}}"
      />
    </div>
  </LocalStateProvider>
);

/**
 * Select controls a line chart showing monthly trends for the selected year.
 */
export const SelectControlsLineChart: Story = () => (
  <LocalStateProvider defaults={{ year: "2023" }}>
    <div className="space-y-4">
      <Select name="year" label="Select Year" options={yearOptions} defaultValue="2023" />
      <LineChart
        data={salesByYear}
        xKey="month"
        yKey="revenue"
        height={300}
        animateBy="year"
        frameValue="{{year}}"
        curve="monotone"
      />
    </div>
  </LocalStateProvider>
);

/**
 * Multiple controls affecting the same chart.
 * Shows how LocalState can coordinate multiple inputs.
 */
export const MultipleControlsDemo: Story = () => (
  <LocalStateProvider defaults={{ year: "2022", showGrid: true }}>
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Select name="year" label="Year" options={yearOptions} defaultValue="2022" />
      </div>
      <p className="text-sm text-muted-foreground">
        Selected year filters the chart data using LocalState bindings.
      </p>
      <BarChart
        data={salesByYear}
        xKey="month"
        yKey="revenue"
        height={300}
        animateBy="year"
        frameValue="{{year}}"
        showGrid
      />
    </div>
  </LocalStateProvider>
);

/**
 * Without LocalStateProvider - shows that components still work standalone.
 * The Select won't affect the chart (no binding).
 */
export const WithoutProvider: Story = () => (
  <div className="space-y-4">
    <p className="text-sm text-amber-600">
      Without LocalStateProvider: Select and Chart are independent
    </p>
    <Select name="year" label="Select Year" options={yearOptions} />
    <BarChart
      data={salesByYear.filter((d) => d.year === 2022)}
      xKey="month"
      yKey="revenue"
      height={300}
    />
  </div>
);

/**
 * Slider controls the year - drag to scrub through years.
 */
export const SliderControlsBarChart: Story = () => (
  <LocalStateProvider defaults={{ year: 2022 }}>
    <div className="space-y-4">
      <Slider name="year" min={2021} max={2023} step={1} label="Year" />
      <BarChart
        data={salesByYear}
        xKey="month"
        yKey="revenue"
        height={300}
        animateBy="year"
        frameValue="{{year}}"
      />
    </div>
  </LocalStateProvider>
);

/**
 * Slider controls the region for pie chart.
 */
export const SliderControlsPieChart: Story = () => {
  const regions = ["North", "South", "East", "West"];
  return (
    <LocalStateProvider defaults={{ regionIndex: 0 }}>
      <div className="space-y-4">
        <SliderWithLabels
          name="regionIndex"
          labels={regions}
          label="Region"
        />
        <PieChartWithRegionIndex data={categoryByRegion} regions={regions} />
      </div>
    </LocalStateProvider>
  );
};

// Helper: Slider that shows labels instead of numbers
function SliderWithLabels({
  name,
  labels,
  label,
}: {
  name: string;
  labels: string[];
  label?: string;
}) {
  const localState = useLocalState();
  const currentIndex = (localState?.values[name] as number) ?? 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    localState?.setValue(name, val);
  };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium">
          {label}: <span className="font-bold">{labels[currentIndex]}</span>
        </label>
      )}
      <input
        type="range"
        min={0}
        max={labels.length - 1}
        step={1}
        value={currentIndex}
        onChange={handleChange}
        className="w-64 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      <div className="flex justify-between text-xs text-muted-foreground w-64">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// Helper: PieChart that reads regionIndex and converts to region name
function PieChartWithRegionIndex({
  data,
  regions,
}: {
  data: typeof categoryByRegion;
  regions: string[];
}) {
  const localState = useLocalState();
  const regionIndex = (localState?.values.regionIndex as number) ?? 0;
  const region = regions[regionIndex];

  return (
    <PieChart
      data={data.filter((d) => d.region === region)}
      nameKey="category"
      valueKey="sales"
      height={300}
    />
  );
}

/**
 * Auto-animation: Chart cycles through years automatically.
 * Uses native Vega-Lite timer selection (PR #8921).
 */
export const AutoAnimationBarChart: Story = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Auto-animation: cycles through years (native Vega-Lite timer)
    </p>
    <BarChart
      data={salesByYear}
      xKey="month"
      yKey="revenue"
      height={300}
      animateBy="year"
    />
  </div>
);

/**
 * Auto-animation on line chart.
 * Note: showDots=false avoids layer limitation with animation.
 */
export const AutoAnimationLineChart: Story = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Auto-animation: cycles through years (native Vega-Lite timer)
    </p>
    <LineChart
      data={salesByYear}
      xKey="month"
      yKey="revenue"
      height={300}
      animateBy="year"
      curve="monotone"
      showDots={false}
    />
  </div>
);

/**
 * Auto-animation on pie chart cycling through regions.
 */
export const AutoAnimationPieChart: Story = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Auto-animation: cycles through regions
    </p>
    <PieChart
      data={categoryByRegion}
      nameKey="category"
      valueKey="sales"
      height={300}
      animateBy="region"
    />
  </div>
);
