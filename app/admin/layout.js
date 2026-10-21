import AdminShell from "@/components/admin/AdminShell";

export const viewport = {
  themeColor: "#f5f5f2",
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
