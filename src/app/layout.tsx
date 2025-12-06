import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
        <body className={GeistSans.className}>
          <Navbar/>
        <main>{children}</main>
        <Footer/>
        <Analytics />
      </body>
    </html>
  );
}
