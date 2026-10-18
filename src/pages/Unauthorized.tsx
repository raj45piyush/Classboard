import { useLocation, Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Unauthorized() {
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F5F5] p-6 text-center">
      <ShieldAlert className="h-8 w-8 text-[#747780]" />
      <h1 className="text-lg font-semibold text-[#303238]">
        {reason === "disabled" ? "Your account has been disabled" : "You don't have access to this page"}
      </h1>
      <p className="max-w-sm text-sm text-[#747780]">
        {reason === "disabled"
          ? "An administrator has disabled this account. Contact your admin for help."
          : "Sign in with an account that has the right permissions, or go back home."}
      </p>
      <Link to="/">
        <Button variant="secondary" size="sm">
          Back to home
        </Button>
      </Link>
    </div>
  );
}
