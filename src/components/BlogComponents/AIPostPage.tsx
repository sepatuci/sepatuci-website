"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bebas_Neue } from 'next/font/google';
import { notFound } from 'next/navigation';

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap' });

interface AIPost {
  id:             number;
  title:          string;
  content:        string;
  cluster_hash:   string;
  source_titles:  string[];
  source_urls:    string[];
  source_name:    string;
  generated_date: string;
  category:       string;
  hn_score:       number;
}

const API_BASE = '';

export default function AIPostPage({ id }: { id: number }) {
  const [post,         setPost]         = useState<AIPost | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [sourcesOpen,  setSourcesOpen]  = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/posts/${id}`)
      .then(r => {
        if (!r.ok) { setNotFoundFlag(true); return null; }
        return r.json();
      })
      .then(data => { if (data) setPost(data); })
      .catch(() => setNotFoundFlag(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#000000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFoundFlag || !post) return notFound();

  const date = new Date(post.generated_date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Split content on "## What This Means For You" header
  const WTM_HEADER  = /^##\s*What This Means For You/im;
  const parts       = post.content.split(WTM_HEADER);
  const mainContent = parts[0].trim();
  const wtmContent  = parts[1]?.trim() ?? '';

  // ── Content renderer ──────────────────────────────────────────────────────
  // Handles: ## headers, ### sub-headers, numbered lists, bullet lists, **bold**

  function renderInline(text: string): React.ReactNode {
    const segments = text.split(/(\*\*[^*]+\*\*)/g);
    return segments.map((seg, i) =>
      seg.startsWith('**') && seg.endsWith('**')
        ? <strong key={i} style={{ color: '#ffffff', fontWeight: 600 }}>{seg.slice(2, -2)}</strong>
        : seg
    );
  }

  function renderBlocks(raw: string, keyPrefix: string): React.ReactNode[] {
    const lines   = raw.split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line) { i++; continue; }

      // ## Section header (not WTM — already stripped)
      if (/^##\s+/.test(line)) {
        blocks.push(
          <h3 key={`${keyPrefix}-${i}`} style={{
            fontSize: '1.2rem', fontWeight: 700, color: '#7c3aed',
            marginTop: '2em', marginBottom: '0.6em', letterSpacing: '0.02em',
          }}>
            {line.replace(/^##\s+/, '')}
          </h3>
        );
        i++; continue;
      }

      // ### Sub-header
      if (/^###\s+/.test(line)) {
        blocks.push(
          <h4 key={`${keyPrefix}-${i}`} style={{
            fontSize: '1.05rem', fontWeight: 600, color: 'rgba(124,58,237,0.85)',
            marginTop: '1.6em', marginBottom: '0.5em',
          }}>
            {line.replace(/^###\s+/, '')}
          </h4>
        );
        i++; continue;
      }

      // Numbered list — collect consecutive `N.` lines
      if (/^\d+\.\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
          i++;
        }
        blocks.push(
          <ol key={`${keyPrefix}-ol-${i}`} style={{
            paddingLeft: '1.4em', marginBottom: '1.8em',
          }}>
            {items.map((item, j) => (
              <li key={j} style={{
                fontSize: '1.1rem', lineHeight: 1.9,
                color: 'rgba(255,255,255,0.85)', marginBottom: '0.6em',
              }}>
                {renderInline(item)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Bullet list — collect consecutive `- ` / `• ` / `* ` lines
      if (/^[-•*]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-•*]\s+/, ''));
          i++;
        }
        blocks.push(
          <ul key={`${keyPrefix}-ul-${i}`} style={{
            paddingLeft: '1.4em', marginBottom: '1.8em', listStyleType: 'disc',
          }}>
            {items.map((item, j) => (
              <li key={j} style={{
                fontSize: '1.1rem', lineHeight: 1.9,
                color: 'rgba(255,255,255,0.85)', marginBottom: '0.6em',
              }}>
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Regular paragraph — collect until blank line or special prefix
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^#{2,3}\s/.test(lines[i].trim()) &&
        !/^\d+\.\s/.test(lines[i].trim()) &&
        !/^[-•*]\s/.test(lines[i].trim())
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push(
          <p key={`${keyPrefix}-p-${i}`} style={{
            fontSize: '1.1rem', lineHeight: 1.9,
            color: 'rgba(255,255,255,0.85)', marginBottom: '1.8em',
          }}>
            {renderInline(paraLines.join(' '))}
          </p>
        );
      }
    }

    return blocks;
  }

  return (
    <div style={{
      minHeight:       '100vh',
      background:      'radial-gradient(ellipse at top, #0f0528 0%, #000000 50%)',
      backgroundColor: '#000000',
      paddingTop:      80,
      paddingBottom:   80,
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 40px' }}>

        {/* Back button */}
        <div style={{ marginBottom: 40, paddingTop: 32 }}>
          <Link
            href="/blog"
            style={{
              color:          'rgba(255,255,255,0.5)',
              textDecoration: 'none',
              fontSize:       '0.9rem',
              transition:     'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7c3aed')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            ← Back to Blog
          </Link>
        </div>

        {/* Category tag */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{
            display:       'inline-block',
            fontSize:      '0.75rem',
            color:         '#7c3aed',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border:        '1px solid rgba(124,58,237,0.3)',
            borderRadius:  20,
            padding:       '4px 14px',
          }}>
            {post.category}
          </span>
        </div>

        {/* Title */}
        <h1
          className={bebasNeue.className}
          style={{
            fontSize:      'clamp(3rem, 5vw, 5rem)',
            color:         '#ffffff',
            lineHeight:    1.05,
            textAlign:     'center',
            marginBottom:  24,
            letterSpacing: '0.03em',
          }}
        >
          {post.title}
        </h1>

        {/* Date + score */}
        <div style={{
          textAlign:  'center',
          color:      'rgba(255,255,255,0.4)',
          fontSize:   '0.85rem',
          marginBottom: 20,
          display:    'flex',
          gap:        16,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <span>{date}</span>
          <span>·</span>
          <span>▲ {post.hn_score} avg HN score</span>
          <span>·</span>
          <span>{post.source_name}</span>
        </div>

        {/* Source stories collapsible */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <button
            onClick={() => setSourcesOpen(o => !o)}
            style={{
              background:  'none',
              border:      'none',
              color:       'rgba(255,255,255,0.3)',
              fontSize:    '0.8rem',
              cursor:      'pointer',
              transition:  'color 0.2s',
              padding:     0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            Based on {post.source_titles.length} Hacker News {post.source_titles.length === 1 ? 'story' : 'stories'} {sourcesOpen ? '▲' : '▼'}
          </button>

          {sourcesOpen && (
            <div style={{
              marginTop:    12,
              padding:      '16px 20px',
              background:   'rgba(255,255,255,0.03)',
              border:       '1px solid rgba(124,58,237,0.15)',
              borderRadius: 12,
              textAlign:    'left',
            }}>
              {post.source_titles.map((title, i) => (
                <div key={i} style={{ marginBottom: i < post.source_titles.length - 1 ? 10 : 0 }}>
                  <a
                    href={post.source_urls[i]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color:          'rgba(255,255,255,0.5)',
                      fontSize:       '0.85rem',
                      textDecoration: 'none',
                      lineHeight:     1.5,
                      transition:     'color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#7c3aed')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                  >
                    {title} ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{
          borderTop:  '1px solid rgba(124,58,237,0.2)',
          marginBottom: 48,
        }} />

        {/* Main content */}
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {renderBlocks(mainContent, 'main')}

          {/* "What This Means For You" section */}
          {wtmContent && (
            <>
              <h2 style={{
                fontSize:     '1.3rem',
                fontWeight:   700,
                color:        '#7c3aed',
                marginTop:    '2.5em',
                marginBottom: '1em',
              }}>
                What This Means For You
              </h2>
              {renderBlocks(wtmContent, 'wtm')}
            </>
          )}

          {/* Bottom back link */}
          <div style={{ marginTop: 64, textAlign: 'center' }}>
            <Link
              href="/blog"
              style={{
                color:          '#7c3aed',
                textDecoration: 'none',
                fontSize:       '0.95rem',
                transition:     'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Back to Blog →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
