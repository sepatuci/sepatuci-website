import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="dark min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />

      <div className="relative z-10 text-center section-padding">
        {/* 404 number */}
        <h1 className="text-8xl sm:text-9xl font-light text-transparent bg-clip-text bg-gradient-to-b from-foreground to-muted-foreground/30 mb-4">
          404
        </h1>

        {/* Message */}
        <h2 className="heading-3 text-foreground mb-4">
          Page Not Found
        </h2>
        <p className="body-large max-w-md mx-auto mb-10">
          Looks like this page doesn&apos;t exist. Let&apos;s get you back to building.
        </p>

        {/* CTA */}
        <div className="flex justify-center">
          <Link href="/">
            <button className="btn-primary flex items-center gap-2">
              <Home className="w-5 h-5" />
              <span>Back Home</span>
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}
