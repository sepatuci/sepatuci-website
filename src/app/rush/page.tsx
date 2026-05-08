import ContactSection from "@/components/RushComponents/contact";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rush SEP",
  description: "Rush Sigma Eta Pi at UC Irvine. Apply to join UCI's premier entrepreneurship fraternity. No business experience required—just a passion for building and creating. Open to all majors.",
  keywords: ["rush SEP UCI", "join entrepreneurship fraternity", "UCI rush", "Sigma Eta Pi recruitment", "UCI startup club application"],
  alternates: { canonical: "https://sepatuci.com/rush" },
  openGraph: {
    title: "Rush SEP | SEP at UCI",
    description: "Apply to join UCI's premier entrepreneurship fraternity. No business experience required—just a passion for building and creating.",
    url: "https://sepatuci.com/rush",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rush SEP | SEP at UCI",
    description: "Apply to join UCI's premier entrepreneurship fraternity. Open to all majors.",
  },
}

export default function RushPage() {
  return (
    <div
      className="dark"
      style={{
        minHeight:       '100vh',
        paddingTop:      '80px',
        background:      'radial-gradient(ellipse at top, #1a0800 0%, #000000 50%)',
        backgroundColor: '#000000',
      }}
    >
      <ContactSection />
    </div>
  );
}
