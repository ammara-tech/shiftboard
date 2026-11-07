import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import AppShell from "@/components/AppShell";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "ShiftBoard — the staff rota for small businesses",
  description:
    "The staff rota for cafés, salons and shops. Build the week, publish it to everyone's phone, swap shifts, approve time off, and add up hours for payroll.",
  appleWebApp: { capable: true, title: "ShiftBoard", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1524" },
  ],
};

// Applies the saved (or the phone's) light/dark theme before the page is drawn, so there's no flash
const themeScript = `try{var t=localStorage.getItem("shiftboard:theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;if(localStorage.getItem("shiftboard:signedIn"))document.documentElement.dataset.signedIn="1"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={bricolage.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
