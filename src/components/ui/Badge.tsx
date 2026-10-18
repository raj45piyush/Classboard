import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

type Tone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[#EEEEF0] text-[#747780] border-[#D9DADD]",
  success: "bg-[#eaf4ea] text-[#2e6b31] border-[#c9e2c9]",
  warning: "bg-[#fbf2e3] text-[#8a6416] border-[#eddcb6]",
  danger: "bg-[#fbecec] text-[#a33] border-[#eccaca]",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
