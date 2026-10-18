import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";

export default function Home() {
  return <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12">
    <section className="w-full max-w-md rounded-lg border border-[#D9DADD] bg-white p-6 shadow-sm sm:p-8">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#D9DADD] bg-[#F5F5F5]"><Users className="h-5 w-5" /></div>
      <h1 className="mt-4 text-center text-xl font-semibold tracking-tight">Join a classroom</h1>
      <p className="mt-2 text-center text-sm leading-6 text-[#747780]">Enter the class code shared by your teacher to view the live board and published lessons.</p>
      <Link to="/join" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#303238] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#44464d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#303238]">Join Classroom <ArrowRight className="h-4 w-4" /></Link>
      <p className="mt-4 text-center text-xs text-[#747780]">No student account needed. Have a classroom code ready.</p>
    </section>
  </div>;
}
