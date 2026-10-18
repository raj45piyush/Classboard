import { Link, Outlet } from "react-router-dom";
import { PenSquare } from "lucide-react";

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] text-[#303238]">
      <header className="border-b border-[#D9DADD] bg-white">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold" aria-label="ClassBoard home">
            <PenSquare className="h-5 w-5" /> ClassBoard
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
            <Link to="/join" className="rounded px-2 py-1.5 text-sm text-[#5f626a] hover:bg-[#F5F5F5]">Join classroom</Link>
            <Link to="/auth/teacher?mode=signin" className="rounded px-2 py-1.5 text-sm text-[#5f626a] hover:bg-[#F5F5F5]">Teacher</Link>
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col"> <Outlet /> </main>
      <footer className="border-t border-[#D9DADD] bg-white py-4 text-center text-xs text-[#747780]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
          <span className="font-medium text-[#303238]">ClassBoard</span>
          <span>Shared classroom boards and lesson spaces.</span>
          <div className="flex flex-wrap justify-center gap-3"><Link className="underline underline-offset-2 hover:text-[#303238]" to="/join">Join classroom</Link><Link className="underline underline-offset-2 hover:text-[#303238]" to="/login/admin">Admin login</Link><a className="underline underline-offset-2 hover:text-[#303238]" href="mailto:rajmacbookair@gmail.com">Help: rajmacbookair@gmail.com</a><a className="underline underline-offset-2 hover:text-[#303238]" href="https://x.com/mayaajaall" target="_blank" rel="noreferrer">@mayaajaall</a></div>
        </div>
      </footer>
    </div>
  );
}
