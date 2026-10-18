import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-[#747780]", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
      <Spinner label={label} />
    </div>
  );
}
