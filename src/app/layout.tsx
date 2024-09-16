import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
        <body className={inter.className}>
          <Navbar/>
        <main>{children}</main>
        <Footer/>
      </body>
    </html>
  );
}