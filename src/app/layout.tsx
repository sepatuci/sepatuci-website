import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import AnalyticsClient from "@/components/AnalyticsClient";
import { THEME_BOOT_SCRIPT } from "@/lib/portal/theme";
import { SPLASH_BOOT_SCRIPT } from "@/lib/splash/boot";
import HideOnPortal from "@/components/HideOnPortal";
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer";
import SplashScreen from "@/components/SplashScreen";

export const metadata: Metadata = {
  metadataBase: new URL('https://sepatuci.com'),
  title: {
    default: "SEP at UCI | Premier Entrepreneurship Fraternity",
    template: "%s | SEP at UCI"
  },
  description: "UCI's startup community for student founders. Launch your startup at UC Irvine with 40+ entrepreneurs. 30+ startups launched, $7M+ funding raised. Open to all majors.",
  keywords: ["UCI startups", "startup clubs UCI", "UCI entrepreneurship", "student founders UCI", "Irvine startup incubator", "UCI founder community", "Sigma Eta Pi", "SEP UCI", "how to start a startup at UCI", "UCI business fraternity"],
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
    <html lang='en' suppressHydrationWarning>
        <head>
          {/* Decides, before anything is painted, whether this real page load
              opens with the splash: it marks <html data-splash="pending">, masks
              the page behind the splash shell, and arms a backstop that lifts
              both after a few seconds whatever else happens. The sign-in and
              portal pages, single-page navigations and people who asked for
              less motion never see it. See src/lib/splash/boot.ts. */}
          <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }} />
          {/* Without JavaScript nothing animates, so the hero's reveal
              elements, which start hidden for the animation, are shown. */}
          <noscript>
            <style>{"[data-hero-reveal]{opacity:1!important;transform:none!important}"}</style>
          </noscript>
          {/* Sets light or dark mode on the sign-in and portal pages before
              anything is painted. It does nothing on the public pages. */}
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className={GeistSans.className}>
          <SplashScreen />
          <HideOnPortal><Navbar/></HideOnPortal>
        <main>{children}</main>
        <HideOnPortal><Footer/></HideOnPortal>
        <AnalyticsClient />
      </body>
    </html>
  );
}
