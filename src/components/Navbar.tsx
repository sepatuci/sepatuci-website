"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import sepLogo from "../assets/logos/sep_logos/sep_white.png";
import { BookOpen, Users, Rocket, HandHeart, Menu, X, ExternalLink } from 'lucide-react';


const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    {
      href: "/founderseducation",
      label: "Founder's Education",
      icon: BookOpen,
    },
    {
      href: "/people",
      label: "People",
      icon: Users,
    },
    {
      href: "/brotherhood",
      label: "Brotherhood",
      icon: HandHeart,
    },
    {
      href: "/rush",
      label: "Rush",
      icon: Rocket,
    },
  ];

  return (
    <nav className="fixed w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
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
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                <Icon className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                <span>{label}</span>
              </Link>
            ))}
            
            {/* CTA Button */}
            <Link
              href="https://www.instagram.com/sepatuci/"
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
            {isOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="lg:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <div className="section-padding py-6 space-y-2">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
              >
                <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                <span>{label}</span>
              </Link>
            ))}
            
            <div className="pt-4">
              <Link
                href="https://www.instagram.com/sepatuci/"
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
