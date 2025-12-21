import type { Story } from "@ladle/react";
import { Loader } from "./loader";

export default {
  title: "Static/Loader",
};

export const Default: Story = () => <Loader />;

export const Variants: Story = () => (
  <div className="flex flex-wrap gap-8 items-center">
    <div className="flex flex-col items-center gap-2">
      <Loader variant="spinner" />
      <span className="text-xs text-muted-foreground">spinner</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="dots" />
      <span className="text-xs text-muted-foreground">dots</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="bars" />
      <span className="text-xs text-muted-foreground">bars</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="pulse" />
      <span className="text-xs text-muted-foreground">pulse</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="ring" />
      <span className="text-xs text-muted-foreground">ring</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="bounce" />
      <span className="text-xs text-muted-foreground">bounce</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="wave" />
      <span className="text-xs text-muted-foreground">wave</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader variant="square" />
      <span className="text-xs text-muted-foreground">square</span>
    </div>
  </div>
);

export const Sizes: Story = () => (
  <div className="flex flex-col gap-6">
    {(["spinner", "dots", "bars"] as const).map((variant) => (
      <div key={variant} className="flex items-center gap-6">
        <span className="w-16 text-sm text-muted-foreground">{variant}</span>
        <Loader variant={variant} size="xs" />
        <Loader variant={variant} size="sm" />
        <Loader variant={variant} size="md" />
        <Loader variant={variant} size="lg" />
        <Loader variant={variant} size="xl" />
      </div>
    ))}
  </div>
);

export const Colors: Story = () => (
  <div className="flex gap-8 items-center">
    <div className="flex flex-col items-center gap-2">
      <Loader color="default" />
      <span className="text-xs text-muted-foreground">default</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader color="primary" />
      <span className="text-xs text-muted-foreground">primary</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader color="secondary" />
      <span className="text-xs text-muted-foreground">secondary</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader color="muted" />
      <span className="text-xs text-muted-foreground">muted</span>
    </div>
  </div>
);

export const Speeds: Story = () => (
  <div className="flex gap-12 items-center">
    <div className="flex flex-col items-center gap-2">
      <Loader speed="slow" />
      <span className="text-xs text-muted-foreground">slow</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader speed="normal" />
      <span className="text-xs text-muted-foreground">normal</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Loader speed="fast" />
      <span className="text-xs text-muted-foreground">fast</span>
    </div>
  </div>
);

export const WithLabels: Story = () => (
  <div className="flex gap-12 items-start">
    <Loader variant="spinner" label="Loading..." />
    <Loader variant="dots" label="Please wait" />
    <Loader variant="bars" label="Processing" size="lg" />
  </div>
);

export const AllVariantsGrid: Story = () => (
  <div className="grid grid-cols-4 gap-8">
    {(["spinner", "dots", "bars", "pulse", "ring", "bounce", "wave", "square"] as const).map((variant) => (
      <div key={variant} className="flex flex-col items-center gap-4 p-4 border rounded-lg">
        <Loader variant={variant} size="lg" />
        <span className="text-sm font-medium">{variant}</span>
        <div className="flex gap-2">
          <Loader variant={variant} size="xs" color="muted" />
          <Loader variant={variant} size="sm" color="muted" />
          <Loader variant={variant} size="md" color="muted" />
        </div>
      </div>
    ))}
  </div>
);

export const InContext: Story = () => (
  <div className="flex flex-col gap-6 max-w-md">
    <div className="p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <Loader variant="spinner" size="sm" />
        <span>Saving changes...</span>
      </div>
    </div>

    <button className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md">
      <Loader variant="spinner" size="xs" color="primary" className="text-primary-foreground" />
      <span>Submitting</span>
    </button>

    <div className="h-32 border rounded-lg flex items-center justify-center bg-muted/30">
      <Loader variant="dots" size="lg" label="Loading content..." />
    </div>
  </div>
);
