import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface Props extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "type"> {
  value: number | null | "";
  onCommit: (value: number | null) => void;
  integer?: boolean;
}

/**
 * A number input that only commits the value on blur or Enter,
 * allowing free-form typing of decimals like "0.5".
 */
export function NumberInput({ value, onCommit, integer, placeholder, ...rest }: Props) {
  const [draft, setDraft] = useState(() => formatValue(value));

  useEffect(() => {
    setDraft(formatValue(value));
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = integer ? parseInt(trimmed, 10) : parseFloat(trimmed);
    if (isNaN(parsed)) {
      onCommit(null);
      setDraft("");
    } else {
      onCommit(parsed);
    }
  }, [draft, integer, onCommit]);

  return (
    <Input
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      {...rest}
    />
  );
}

function formatValue(v: number | null | ""): string {
  if (v === null || v === "" || v === 0) return "";
  return String(v);
}
