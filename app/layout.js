import "./globals.css";

export const metadata = {
  title: "smato — ad screens",
  description: "Upload ads, schedule them per auto, and run them offline on the tablet.",
  // Add to Home Screen installs the admin console, from whichever page it's
  // done on — the tablets run the player through their own kiosk app, never
  // as an installed web app. The manifest is linked site-wide (the player
  // page included) and keeps id "/player": that was the identity of the old
  // player-only manifest, so phones that installed smato back then get
  // their existing icon updated to open the admin instead of the player.
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "smato",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0f0d",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-text font-body antialiased">{children}</body>
    </html>
  );
}
