import type { Metadata, Viewport } from "next";
import "./globals.css";

// 1. Lock the viewport. This stops all unwanted zooming and forces the 
// UI to resize perfectly around the mobile keyboard.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: "Espresso Terminal",
  description: "Advanced Personal Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      {/* 2. Use 100dvh (Dynamic Viewport Height) and overscroll-none */}
      <body className="flex flex-col h-[100dvh] font-sans bg-[#050505] text-zinc-300 overflow-hidden overscroll-none">
        {children}
      </body>
    </html>
  );
}