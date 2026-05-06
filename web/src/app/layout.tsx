import type { Metadata } from "next";
import { AuthHeader } from "@/components/AuthHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeType Solo",
  description: "Daily code-snippet typing trainer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono antialiased">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <AuthHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
