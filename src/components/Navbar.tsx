"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import sepLogo from "../assets/logos/sep_logos/sep_white.png";
import { Menu, X, ExternalLink } from 'lucide-react';

const Navbar: React.FC = () => {
  const [isOpen,    setIsOpen]    = useState(false);
  const [scrolled,  setScrolled]  = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
        transition:     'background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease',
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

            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLSeOXUWoniHjlFl-ABRuzTXkKK8MOTdO91Y2sv_xX-DuOVUlgQ/viewform?usp=sharing&ouid=116780283286912141619"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-6"
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
            <div className="pt-4">
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSeOXUWoniHjlFl-ABRuzTXkKK8MOTdO91Y2sv_xX-DuOVUlgQ/viewform?usp=sharing&ouid=116780283286912141619"
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
