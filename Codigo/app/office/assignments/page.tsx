"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OfficeAssignmentsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/office");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0b10] flex items-center justify-center text-xs text-gray-500 font-mono">
      Redirecting to Office Control Center...
    </div>
  );
}
