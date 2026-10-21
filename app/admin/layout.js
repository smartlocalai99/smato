import AdminShell from "@/components/admin/AdminShell";

// The admin console is used on phones, installed to the home screen: its
// own manifest opens it standalone and portrait at /admin, unlike the
// player's fullscreen landscape one.
export const metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    title: "smato",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#f5f5f2",
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
