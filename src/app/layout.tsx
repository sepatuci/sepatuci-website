import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer";
import SplashScreen from "@/components/SplashScreenClient";

export const metadata: Metadata = {
  metadataBase: new URL('https://sepatuci.com'),
  title: {
    default: "SEP at UCI | Premier Entrepreneurship Fraternity",
    template: "%s | SEP at UCI"
  },
  description: "UCI's startup community for student founders. Launch your startup at UC Irvine with 40+ entrepreneurs. 20+ startups launched, $1M+ funding raised. Open to all majors.",
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
    <html lang='en'>
        <head>
          {/* Synchronous mask: on every real page load (refresh / direct URL)
              clear splashSeen and hide body content so the splash is the first
              thing painted. SPA navigations never re-run this script, so the
              already-mounted SplashScreen component (visible=false) stays hidden. */}
          <script dangerouslySetInnerHTML={{__html:
            `try{` +
            `sessionStorage.removeItem('splashSeen');` +
            `var s=document.createElement('style');` +
            `s.id='splash-mask';` +
            `s.textContent='body>*:not([data-splash-screen]){opacity:0!important;pointer-events:none}';` +
            `document.head.appendChild(s);` +
            `}catch(e){}`
          }} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </head>
        <body className={GeistSans.className}>
          <SplashScreen />
          <Navbar/>
        <main>{children}</main>
        <Footer/>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
