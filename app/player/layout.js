// The tablet player installs as its own fullscreen, landscape app — a
// different manifest from the admin console's (see app/admin/layout.js).
export const metadata = {
  manifest: "/manifest.json",
};

export default function PlayerLayout({ children }) {
  return children;
}
