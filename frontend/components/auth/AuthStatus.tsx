"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!email) return null;

  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="text-gray-500">{email}</span>
      <button
        onClick={handleLogout}
        className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-white cursor-pointer transition-colors font-medium"
      >
        Sign out
      </button>
    </div>
  );
}
