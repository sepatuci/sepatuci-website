"use client";

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

interface Post {
  slug:        string;
  title:       string;
  date:        string;
  description: string;
}

const BlogList: React.FC<{ posts: Post[] }> = ({ posts }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      container.querySelectorAll('[data-post]').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
      });
    }, { threshold: 0.1 });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (posts.length === 0) {
    return (
      <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '48px 0' }}>
        No posts yet. Check back soon!
      </p>
    );
  }

  return (
    <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {posts.map(post => (
        <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
          <article
            data-post
            className="fade-up dark-card"
            style={{ padding: '36px 40px', cursor: 'pointer' }}
          >
            <div style={{
              fontSize:      '0.8rem',
              color:         '#7c3aed',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom:  12,
            }}>
              {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <h2 style={{
              fontSize:     '1.4rem',
              fontWeight:   700,
              color:        '#ffffff',
              marginBottom: 12,
              lineHeight:   1.3,
            }}>
              {post.title}
            </h2>
            <p style={{
              fontSize:   '0.95rem',
              color:      'rgba(255,255,255,0.6)',
              lineHeight: 1.7,
              marginBottom: 20,
            }}>
              {post.description}
            </p>
            <div style={{ fontSize: '0.9rem', color: '#7c3aed' }}>
              Read more →
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
};

export default BlogList;
