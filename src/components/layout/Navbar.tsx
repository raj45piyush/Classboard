import { Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, NotebookPen, ShieldCheck, Users2, Activity, School } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { initialsFromName } from "@/utils/format";

const teacherLinks = [
  { to: "/teacher", label: "Classrooms", icon: LayoutDashboard },
  { to: "/teacher/lessons", label: "Lessons", icon: NotebookPen },
];

const adminLinks = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/teachers", label: "Teachers", icon: Users2 },
  { to: "/admin/classrooms", label: "Classrooms", icon: School },
  { to: "/admin/activity", label: "Activity", icon: Activity },
];

export function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;
  const links = profile.role === "admin" ? adminLinks : profile.role === "teacher" ? teacherLinks : [];

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[#D9DADD] bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[#303238]">
            <ShieldCheck className="h-5 w-5" />
            ClassBoard
          </Link>
          <nav aria-label="Workspace navigation" className="flex max-w-full items-center gap-1 overflow-x-auto">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[#747780] hover:bg-[#EEEEF0] hover:text-[#303238]"
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEEEF0] text-xs font-medium text-[#303238]">
              {initialsFromName(profile.displayName || profile.email || profile.phoneNumber || "U")}
            </div>
            <span className="text-sm text-[#303238]">{profile.displayName || profile.email || profile.phoneNumber}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
