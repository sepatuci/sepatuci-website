"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiPost {
  id:             number;
  title:          string;
  content:        string;
  source_url:     string;
  source_name:    string;
  generated_date: string;
  category:       string;
  hn_score:       number;
}

interface StaticPost {
  slug:        string;
  title:       string;
  date:        string;
  description: string;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
  <div
    style={{
      background:    'rgba(255,255,255,0.03)',
      border:        '1px solid rgba(196, 92, 26, 0.15)',
      borderRadius:  16,
      padding:       '36px 40px',
      overflow:      'hidden',
      position:      'relative',
    }}
  >
    <style>{`
      @keyframes shimmer {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(100%);  }
      }
      .skeleton-shimmer::after {
        content:    '';
        position:   absolute;
        inset:      0;
        background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(196,92,26,0.08) 50%, rgba(255,255,255,0.03) 100%);
        animation:  shimmer 1.6s ease-in-out infinite;
      }
    `}</style>
    <div className="skeleton-shimmer" style={{ position: 'absolute', inset: 0 }} />
    {/* Date bar */}
    <div style={{ width: 120, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginBottom: 16 }} />
    {/* Title bar */}
    <div style={{ width: '70%', height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />
    <div style={{ width: '50%', height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.07)', marginBottom: 20 }} />
    {/* Excerpt lines */}
    <div style={{ width: '100%', height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 8 }} />
    <div style={{ width: '90%',  height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 8 }} />
    <div style={{ width: '75%',  height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
  </div>
);

// ── API post card (expandable inline) ─────────────────────────────────────────

const pillStyle: React.CSSProperties = {
  fontSize:     '0.7rem',
  border:       '1px solid rgba(196,92,26,0.3)',
  borderRadius: 20,
  padding:      '3px 10px',
  whiteSpace:   'nowrap',
}

const ApiCard: React.FC<{ post: ApiPost }> = ({ post }) => {
  const [expanded, setExpanded] = useState(false);
  const excerpt = post.content.slice(0, 180) + (post.content.length > 180 ? '…' : '');
  const date    = new Date(post.generated_date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <article
      data-post
      className="fade-up dark-card"
      style={{ padding: '36px 40px', cursor: 'pointer', position: 'relative' }}
    >
      {/* Badges — top right */}
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ ...pillStyle, color: 'rgba(255,255,255,0.4)' }}>
          ▲ {post.hn_score}
        </span>
        <span style={{ ...pillStyle, color: '#c45c1a' }}>
          {post.source_name}
        </span>
      </div>

      <div style={{
        fontSize:      '0.8rem',
        color:         '#c45c1a',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginBottom:  12,
      }}>
        {date}
      </div>

      <h2
        onClick={() => setExpanded(e => !e)}
        style={{
          fontSize:     '1.4rem',
          fontWeight:   700,
          color:        '#ffffff',
          marginBottom: 8,
          lineHeight:   1.3,
          paddingRight: 120,
        }}
      >
        {post.title}
      </h2>

      {/* Category tag */}
      <div style={{
        fontSize:      '0.75rem',
        color:         '#c45c1a',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom:  16,
      }}>
        {post.category}
      </div>

      {/* Collapsible content — smooth max-height transition */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          overflow:   'hidden',
          maxHeight:  expanded ? '2000px' : '5.5em',
          transition: 'max-height 0.5s ease',
        }}
      >
        {expanded ? (
          <p style={{
            fontSize:   '0.95rem',
            color:      'rgba(255,255,255,0.7)',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {post.content}
          </p>
        ) : (
          <p style={{
            fontSize:   '0.95rem',
            color:      'rgba(255,255,255,0.6)',
            lineHeight: 1.7,
          }}>
            {excerpt}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ fontSize: '0.9rem', color: '#c45c1a', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {expanded ? 'Show less ↑' : 'Read more →'}
        </button>
        {expanded && (
          <a
            href={post.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize:        '0.9rem',
              color:           'rgba(255,255,255,0.4)',
              textDecoration:  'none',
              transition:      'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c45c1a')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            View original →
          </a>
        )}
      </div>
    </article>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/posts';

const BlogPageClient: React.FC<{ staticPosts: StaticPost[] }> = ({ staticPosts }) => {
  const [apiPosts, setApiPosts]   = useState<ApiPost[]>([]);
  const [loading,  setLoading]    = useState(true);
  const listRef                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(API_URL)
      .then(r => r.json())
      .then((data: ApiPost[]) => {
        setApiPosts(Array.isArray(data) ? data : []);
      })
      .catch(() => setApiPosts([]))
      .finally(() => setLoading(false));
  }, []);

  // Fade-in API post cards as they scroll into view
  useEffect(() => {
    if (loading || apiPosts.length === 0) return;
    const cards = document.querySelectorAll('[data-post]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });
    cards.forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [loading, apiPosts.length]);

  // Staggered IntersectionObserver fade-in for static posts
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      container.querySelectorAll('[data-static-post]').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
      });
    }, { threshold: 0.1 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [loading]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Pipeline-generated posts ────────────────────────────────── */}
      {loading ? (
        [0, 1, 2].map(k => <SkeletonCard key={k} />)
      ) : (
        apiPosts.map(post => <ApiCard key={post.id} post={post} />)
      )}

      {/* ── Original hardcoded posts — always at the bottom ─────────── */}
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {staticPosts.map(post => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <article
              data-static-post
              className="fade-up dark-card"
              style={{ padding: '36px 40px', cursor: 'pointer' }}
            >
              <div style={{
                fontSize:      '0.8rem',
                color:         '#c45c1a',
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
                fontSize:     '0.95rem',
                color:        'rgba(255,255,255,0.6)',
                lineHeight:   1.7,
                marginBottom: 20,
              }}>
                {post.description}
              </p>
              <div style={{ fontSize: '0.9rem', color: '#c45c1a' }}>
                Read more →
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default BlogPageClient;
