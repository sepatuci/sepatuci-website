"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import sepLogo from "../assets/logos/sep_logos/sep_white.png";
import { Menu, X, ExternalLink, LogIn } from 'lucide-react';
import { useSplashPhase } from '@/lib/splash/client/use-splash-phase';

const ENTRANCE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * How the bar arrives. On a real load that opens with the splash it slides
 * down as the splash hands over; on every other page it is simply there.
 */
type Entrance = 'none' | 'waiting' | 'shown';

const Navbar: React.FC = () => {
  const [isOpen,    setIsOpen]    = useState(false);
  const [scrolled,  setScrolled]  = useState(false);
  const [entrance,  setEntrance]  = useState<Entrance>('none');
  const { phase } = useSplashPhase();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Only a load that began under the splash gets an entrance. The attribute
  // is read once, at mount, so a later page never replays it.
  useEffect(() => {
    const splash = document.documentElement.getAttribute('data-splash');
    if (splash === 'pending' || splash === 'handoff') setEntrance('waiting');
  }, []);

  useEffect(() => {
    if (entrance === 'waiting' && phase !== 'pending') setEntrance('shown');
  }, [entrance, phase]);

  const entranceStyle: React.CSSProperties =
    entrance === 'waiting'
      ? { opacity: 0, transform: 'translateY(-8px)' }
      : entrance === 'shown'
        ? { opacity: 1, transform: 'translateY(0)' }
        : {};
  const entranceTransition =
    entrance === 'shown' ? `, opacity 0.5s ${ENTRANCE_EASE}, transform 0.5s ${ENTRANCE_EASE}` : '';

  const navItems = [
    { href: "/founderseducation", label: "Founder's Education" },
    { href: "/people",            label: "People" },
    { href: "/brotherhood",       label: "Brotherhood" },
    { href: "/rush",              label: "Rush" },
    { href: "/blog",              label: "Blog" },
  ];

  return (
    <nav
      style={{
        position:       'fixed',
        top:            0,
        left:           0,
        width:          '100%',
        zIndex:         100,
        background:     scrolled ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)'           : 'none',
        borderBottom:   scrolled ? '1px solid rgba(124, 58, 237, 0.15)' : '1px solid transparent',
        transition:     `background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease${entranceTransition}`,
        ...entranceStyle,
      }}
    >
      <div className="content-max-width section-padding">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <Image
              src={sepLogo}
              alt="SEP Logo"
              width={120}
              height={48}
              className="h-12 w-auto transition-transform duration-200 group-hover:scale-105"
            />
          </Link>

          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center space-x-2">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-4 py-3 rounded-xl font-mono text-sm tracking-wide text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                {label}
              </Link>
            ))}

            <Link href="/login" className="ml-6 btn-secondary group flex items-center">
              <LogIn className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
              <span>Login</span>
            </Link>

            <Link
              href="https://forms.gle/DjLngqaKkubLyyRu9"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-3"
            >
              <button className="btn-primary group flex items-center">
                <span>Apply</span>
                <ExternalLink className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:scale-110" />
              </button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div
          style={{ background: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(124, 58, 237, 0.15)' }}
          className="lg:hidden"
        >
          <div className="section-padding py-6 space-y-2">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className="block px-4 py-3 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                {label}
              </Link>
            ))}
            <div className="pt-4 space-y-3">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="w-full btn-secondary group flex items-center justify-center"
              >
                <LogIn className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                <span>Login</span>
              </Link>
              <Link
                href="https://forms.gle/DjLngqaKkubLyyRu9"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
              >
                <button className="w-full btn-primary group flex items-center justify-center">
                  <span>Apply</span>
                  <ExternalLink className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:scale-110" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
