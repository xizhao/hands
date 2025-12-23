import type { GlobalProvider } from "@ladle/react";
import { TooltipProvider } from "../src/ui/components/tooltip";
import "./styles.css";

export const Provider: GlobalProvider = ({ children, globalState }) => {
  return (
    <div className={globalState.theme === "dark" ? "dark" : ""}>
      <div className="bg-background text-foreground min-h-screen p-4">
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </div>
    </div>
  );
};
