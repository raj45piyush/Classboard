import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#D9DADD] bg-white px-6 py-12 text-center">
      {icon && <div className="mb-1 text-[#9a9ca3]">{icon}</div>}
      <p className="text-sm font-medium text-[#303238]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[#747780]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
