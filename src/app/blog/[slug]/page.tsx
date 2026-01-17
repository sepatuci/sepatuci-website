import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { Calendar, ArrowLeft, User } from "lucide-react";

const getPost = cache(async (slug: string) => {
  return getPostBySlug(slug);
});

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { metadata } = await getPost(slug);
    return {
      title: metadata.title,
      description: metadata.description,
      openGraph: {
        title: `${metadata.title} | SEP at UCI Blog`,
        description: metadata.description,
        type: "article",
        publishedTime: metadata.date,
        authors: [metadata.author],
      },
    };
  } catch {
    return { title: "Post Not Found" };
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  try {
    const { Content, metadata } = await getPost(slug);

    return (
      <main className="dark min-h-screen bg-background pt-32 pb-16">
        <article className="content-max-width section-padding">
          <div className="max-w-3xl mx-auto">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to blog</span>
            </Link>

            <header className="mb-12">
              <h1 className="heading-1 mb-4">{metadata.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={metadata.date}>
                    {new Date(metadata.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{metadata.author}</span>
                </div>
              </div>
            </header>

            <div className="prose-custom">
              <Content />
            </div>
          </div>
        </article>
      </main>
    );
  } catch {
    notFound();
  }
}
