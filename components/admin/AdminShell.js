"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SignIn from "@/components/admin/SignIn";

const AdminSessionContext = createContext(undefined);

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/drivers/new", label: "Add driver" },
];

export function useAdminSession() {
  return useContext(AdminSessionContext);
}

export default function AdminShell({ children }) {
  const [session, setSession] = useState(undefined);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return <div className="admin-loading" role="status">Loading admin…</div>;
  }

  if (!session) return <SignIn />;

  return (
    <AdminSessionContext.Provider value={session}>
      <div className="console admin-shell">
        <header className="console__bar admin-shell__header">
          <div className="console__brand">
            <span className="console__brand-dot" />
            <span className="console__brand-title">smato / admin</span>
          </div>
          <nav aria-label="Admin navigation" className="admin-shell__nav">
            {adminLinks.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <button className="btn btn--ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </header>
        {children}
      </div>
    </AdminSessionContext.Provider>
  );
}
