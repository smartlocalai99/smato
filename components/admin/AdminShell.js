"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth/admin";
import SignIn from "@/components/admin/SignIn";

const AdminSessionContext = createContext(undefined);

// Registering a driver opens as a modal from the Drivers page now, not a
// separate route, so it no longer needs its own nav entry.
const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/drivers", label: "Drivers" },
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
    return (
      <div
        role="status"
        className="console flex min-h-screen-safe items-center justify-center bg-ink text-text-dim"
      >
        Loading admin…
      </div>
    );
  }

  if (!session) return <SignIn />;

  if (!isAdminUser(session.user)) {
    return (
      <main className="console flex min-h-screen-safe items-center justify-center bg-ink p-6">
        <section
          aria-labelledby="admin-access-heading"
          className="max-w-sm rounded-lg border border-dashed border-line p-8 text-center text-text-dim"
        >
          <h1 id="admin-access-heading" className="font-display text-xl text-text">
            Admin access required
          </h1>
          <p className="mt-2 text-sm">
            You&apos;re signed in, but this account does not have admin access.
          </p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-4 rounded-md border border-line bg-panel-2 px-4 py-2 text-sm font-semibold text-text hover:border-text-faint"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <AdminSessionContext.Provider value={session}>
      <div className="console min-h-screen-safe bg-ink lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-ink/90 px-4 py-4 backdrop-blur-sm sm:px-6 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-dvh lg:flex-col lg:items-stretch lg:justify-start lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
          <div className="flex items-baseline gap-2.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber shadow-[0_0_8px_var(--amber)]" />
            <span className="font-display text-lg">smato / admin</span>
          </div>
          <nav
            aria-label="Admin navigation"
            className="flex min-w-0 items-center gap-1 overflow-x-auto lg:flex-col lg:items-stretch lg:overflow-visible"
          >
            {adminLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className="flex-none whitespace-nowrap rounded-md px-2.5 py-2 font-mono text-xs tracking-wide text-text-dim no-underline hover:bg-panel-2 hover:text-text aria-[current=page]:bg-amber/[0.18] aria-[current=page]:text-on-amber aria-[current=page]:shadow-[inset_0_0_0_1px_rgba(255,176,32,0.44)]"
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md border border-line bg-transparent px-3 py-1.5 text-sm font-semibold text-text hover:border-text-faint lg:mt-auto lg:text-left"
          >
            Sign out
          </button>
        </header>
        <div className="min-w-0 lg:col-start-2">{children}</div>
      </div>
    </AdminSessionContext.Provider>
  );
}
