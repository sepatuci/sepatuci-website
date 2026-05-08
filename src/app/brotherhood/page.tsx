import GallerySection from '@/components/BrotherhoodComponents/brotherhood-gallery';
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Brotherhood",
  description: "Explore SEP at UCI's brotherhood through retreats, socials, and networking events. Our entrepreneurial family creates lifelong connections and memories that extend beyond graduation.",
  keywords: ["SEP brotherhood", "UCI fraternity events", "entrepreneurship community", "SEP retreats", "startup networking UCI"],
  alternates: { canonical: "https://sepatuci.com/brotherhood" },
  openGraph: {
    title: "Brotherhood | SEP at UCI",
    description: "Explore SEP at UCI's brotherhood through retreats, socials, and networking events.",
    url: "https://sepatuci.com/brotherhood",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brotherhood | SEP at UCI",
    description: "Explore SEP at UCI's brotherhood through retreats, socials, and networking events.",
  },
}

export default function BrotherhoodPage() {
  return (
    <div
      className="dark"
      style={{
        minHeight:  '100vh',
        paddingTop: '80px',
        background: 'radial-gradient(ellipse at top, #0f0528 0%, #000000 50%)',
        backgroundColor: '#000000',
      }}
    >
      <GallerySection />
    </div>
  );
}
