import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  metadataBase: new URL('https://sepatuci.com'),
  title: {
    default: "SEP at UCI | Premier Entrepreneurship Fraternity",
    template: "%s | SEP at UCI"
  },
  description: "Join UCI's premier entrepreneurship fraternity. Build startups, connect with founders, and transform your ideas into reality.",
  keywords: ["UCI entrepreneurship", "entrepreneurship fraternity", "startup incubator UCI", "UCI founders", "Sigma Eta Pi", "SEP UCI", "UCI business fraternity", "student entrepreneurs UCI"],
  authors: [{ name: "SEP at UCI" }],
  creator: "SEP at UCI",
  publisher: "SEP at UCI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "https://sepatuci.com",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sepatuci.com",
    siteName: "Sigma Eta Pi at UCI",
    title: "SEP at UCI | Premier Entrepreneurship Fraternity",
    description: "UCI's Home for Builders. Build startups, connect with founders, and transform your ideas into reality.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "SEP at UCI - Premier Entrepreneurship Fraternity",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SEP at UCI | Premier Entrepreneurship Fraternity",
    description: "UCI's Home for Builders. Build startups, connect with founders, and transform your ideas into reality.",
    images: ["/opengraph-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: '9PybvOA-W44JW273A-zcz0Dt_dTe_fXUNdsuDYlfppY',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Sigma Eta Pi at UCI',
  alternateName: 'SEP at UCI',
  url: 'https://sepatuci.com',
  logo: 'https://sepatuci.com/opengraph-image.png',
  description: 'UCI\'s premier entrepreneurship fraternity. Build startups, connect with founders, and transform your ideas into reality.',
  foundingDate: '2014',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Irvine',
    addressRegion: 'CA',
    addressCountry: 'US',
  },
  sameAs: [
    'https://www.instagram.com/sepatuci/',
    'https://www.linkedin.com/company/sigma-eta-pi-uci/',
  ],
  memberOf: {
    '@type': 'EducationalOrganization',
    name: 'University of California, Irvine',
    url: 'https://uci.edu',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className={GeistSans.className}>
          <Navbar/>
        <main>{children}</main>
        <Footer/>
        <Analytics />
      </body>
    </html>
  );
}
