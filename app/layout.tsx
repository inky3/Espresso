import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-[#050505] text-zinc-300">
        {children}
      </body>
    </html>
  );
}