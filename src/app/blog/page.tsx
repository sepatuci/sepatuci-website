import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { Calendar, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Articles about entrepreneurship, startups, and building at UCI. Learn from Sigma Eta Pi's community of student founders.",
  openGraph: {
    title: "Blog | SEP at UCI",
    description:
      "Articles about entrepreneurship, startups, and building at UCI.",
  },
};

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <main className="dark min-h-screen bg-background pt-32 pb-16">
      <div className="content-max-width section-padding">
        <div className="max-w-3xl mx-auto">
          <h1 className="heading-1 mb-4">Blog</h1>
          <p className="body-large text-muted-foreground mb-12">
            Insights on entrepreneurship, startups, and building at UCI.
          </p>

          {posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet. Check back soon!</p>
          ) : (
            <div className="space-y-8">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="group border border-border/50 rounded-2xl p-6 hover:border-border hover:bg-muted/30 transition-all duration-200"
                >
                  <Link href={`/blog/${post.slug}`}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Calendar className="w-4 h-4" />
                      <time dateTime={post.date}>
                        {new Date(post.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                    <h2 className="heading-3 mb-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      {post.description}
                    </p>
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <span>Read more</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
