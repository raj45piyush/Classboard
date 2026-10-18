import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/utils/cn";

type Tone = "info" | "success" | "error";

const toneConfig: Record<Tone, { icon: ReactNode; classes: string }> = {
  info: { icon: <Info className="h-4 w-4" />, classes: "bg-[#EEEEF0] text-[#303238] border-[#D9DADD]" },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    classes: "bg-[#eaf4ea] text-[#2e6b31] border-[#c9e2c9]",
  },
  error: {
    icon: <AlertTriangle className="h-4 w-4" />,
    classes: "bg-[#fbecec] text-[#a33] border-[#eccaca]",
  },
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const config = toneConfig[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", config.classes)}>
      {config.icon}
      <div className="flex-1">{children}</div>
    </div>
  );
}
