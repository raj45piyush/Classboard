import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SlideHistoryControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function SlideHistoryControls({ canUndo, canRedo, onUndo, onRedo }: SlideHistoryControlsProps) {
  return (
    <>
      <Button size="sm" variant="secondary" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={onUndo}>
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="secondary" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={onRedo}>
        <Redo2 className="h-4 w-4" />
      </Button>
    </>
  );
}
