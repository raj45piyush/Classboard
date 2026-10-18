import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F5F5] p-6 text-center">
      <FileQuestion className="h-8 w-8 text-[#747780]" />
      <h1 className="text-lg font-semibold text-[#303238]">Page not found</h1>
      <p className="max-w-sm text-sm text-[#747780]">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link to="/">
        <Button variant="secondary" size="sm">
          Back to home
        </Button>
      </Link>
    </div>
  );
}
