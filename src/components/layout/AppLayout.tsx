import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-[#D9DADD] bg-white px-4 py-3 text-center text-xs text-[#747780]">ClassBoard · Digital Classroom</footer>
    </div>
  );
}
