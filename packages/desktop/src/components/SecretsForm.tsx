import { memo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Key, Eye, EyeOff, Check, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRuntimePort } from "@/hooks/useWorkbook";

interface SecretSpec {
  key: string;
  description: string;
  required: boolean;
  exists: boolean;
}

interface SecretsRequestOutput {
  type: "secrets_request";
  secrets: SecretSpec[];
  message: string;
}

interface SecretsFormProps {
  output: SecretsRequestOutput;
  onSaved?: () => void;
}

/**
 * Parse tool output to check if it's a secrets request
 */
export function parseSecretsOutput(output: string): SecretsRequestOutput | null {
  try {
    const parsed = JSON.parse(output);
    if (parsed.type === "secrets_request" && Array.isArray(parsed.secrets)) {
      return parsed as SecretsRequestOutput;
    }
  } catch {
    // Not JSON or not a secrets request
  }
  return null;
}

/**
 * Password input with show/hide toggle
 */
const SecretInput = memo(({
  spec,
  value,
  onChange,
}: {
  spec: SecretSpec;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="font-mono text-[11px]">{spec.key}</span>
        {spec.exists && (
          <span className="text-[10px] text-green-500 flex items-center gap-0.5">
            <CheckCircle2 className="h-2.5 w-2.5" />
            exists
          </span>
        )}
        {spec.required && !spec.exists && (
          <span className="text-[10px] text-red-400">required</span>
        )}
      </label>
      <p className="text-[10px] text-muted-foreground/60 -mt-0.5 mb-1">
        {spec.description}
      </p>
      <div className="relative">
        <input
          type={showValue ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.exists ? "(leave empty to keep current)" : "Enter value..."}
          className={cn(
            "w-full px-2 py-1.5 pr-8 rounded-md text-xs font-mono",
            "bg-black/30 border border-border/50",
            "placeholder:text-muted-foreground/30",
            "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          )}
        />
        <button
          type="button"
          onClick={() => setShowValue(!showValue)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
        >
          {showValue ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

SecretInput.displayName = "SecretInput";

/**
 * SecretsForm component - renders when the secrets tool requests user input
 */
export const SecretsForm = memo(({ output, onSaved }: SecretsFormProps) => {
  const runtimePort = useRuntimePort();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingSecrets = output.secrets.filter((s) => !s.exists);
  const existingSecrets = output.secrets.filter((s) => s.exists);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!runtimePort) {
      setError("Runtime not connected");
      return;
    }

    // Filter out empty values (don't overwrite existing secrets with empty)
    const secretsToSave: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) {
        secretsToSave[key] = value.trim();
      }
    }

    // Check required secrets
    const stillMissing = missingSecrets.filter(
      (s) => s.required && !secretsToSave[s.key]
    );
    if (stillMissing.length > 0) {
      setError(`Missing required: ${stillMissing.map((s) => s.key).join(", ")}`);
      return;
    }

    if (Object.keys(secretsToSave).length === 0) {
      setError("Please enter at least one secret");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`http://localhost:${runtimePort}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets: secretsToSave }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save secrets");
      }

      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save secrets");
    } finally {
      setSaving(false);
    }
  }, [values, missingSecrets, onSaved, runtimePort]);

  // Already saved state
  if (saved) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 text-xs text-green-400 py-1"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Secrets saved successfully</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-500/20 bg-blue-500/10">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-500/20 text-blue-400">
            <Key className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-medium text-blue-300">
              Secrets Required
            </h3>
            <p className="text-[10px] text-blue-400/70 truncate">
              {output.message}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-3 space-y-3">
        {/* Missing secrets - show inputs */}
        {missingSecrets.map((spec) => (
          <SecretInput
            key={spec.key}
            spec={spec}
            value={values[spec.key] || ""}
            onChange={(value) => handleChange(spec.key, value)}
          />
        ))}

        {/* Existing secrets - show as informational */}
        {existingSecrets.length > 0 && missingSecrets.length > 0 && (
          <div className="pt-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/50 mb-1">
              Already configured:
            </p>
            <div className="flex flex-wrap gap-1">
              {existingSecrets.map((spec) => (
                <span
                  key={spec.key}
                  className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-mono"
                >
                  {spec.key}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-[11px] text-red-400">{error}</p>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className={cn(
            "w-full h-7 text-xs gap-1.5",
            "bg-blue-600 hover:bg-blue-700 text-white"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              Save Secrets
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
});

SecretsForm.displayName = "SecretsForm";
