import type { Metadata } from "next";
import { Bebas_Neue } from 'next/font/google';
import { getAllPosts } from "@/lib/blog";
import BlogPageClient from "@/components/BlogComponents/blog-page-client";

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles about entrepreneurship, startups, and building at UCI. Learn from Sigma Eta Pi's community of student founders.",
  openGraph: {
    title: "Blog | SEP at UCI",
    description: "Articles about entrepreneurship, startups, and building at UCI.",
  },
};

export default async function BlogPage() {
  // Original MDX posts are fetched server-side and passed as permanent entries
  const staticPosts = await getAllPosts();

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
      <section style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <div style={{ fontSize: '0.85rem', color: '#c45c1a', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 16 }}>
              Insights
            </div>
            <h1
              className={bebasNeue.className}
              style={{ fontSize: 'clamp(5rem, 8vw, 7rem)', color: '#ffffff', lineHeight: 1, marginBottom: 20, letterSpacing: '0.04em' }}
            >
              Blog
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
              Insights on entrepreneurship, startups, and building at UCI.
            </p>
          </div>

          {/* Client component handles: API fetch + skeleton + static posts at bottom */}
          <BlogPageClient staticPosts={staticPosts} />

        </div>
      </section>
    </div>
  );
}
