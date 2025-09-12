import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import sepLogo from '../assets/logos/sep_logos/sep_white.png';
import { Instagram, Linkedin } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border/50 bg-background/50 backdrop-blur-xl">
      <div className="content-max-width section-padding py-12">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-4 group">
            <div className="relative">
              <Image 
                src={sepLogo}
                alt="SEP @ UCI Logo" 
                className="w-16 h-16 transition-transform duration-200 group-hover:scale-105"
                width={64}
                height={64}
              />
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground">
                Sigma Eta Pi
              </h3>
              <p className="text-muted-foreground">
                @ UC Irvine
              </p>
            </div>
          </Link>

          {/* Copyright */}
          <div className="text-center lg:text-left">
            <p className="text-muted-foreground">
              © 2025 SEP at UCI. All rights reserved.
            </p>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/sepatuci/"
              rel="noopener noreferrer"
              target="_blank"
              className="group p-3 rounded-xl bg-muted/30 hover:bg-accent hover:text-accent-foreground transition-all duration-200"
              aria-label="Follow us on Instagram"
            >
              <Instagram className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
            </a>

            <a
              href="https://www.linkedin.com/company/sepatuci/mycompany/"
              rel="noopener noreferrer"
              target="_blank"
              className="group p-3 rounded-xl bg-muted/30 hover:bg-accent hover:text-accent-foreground transition-all duration-200"
              aria-label="Connect with us on LinkedIn"
            >
              <Linkedin className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
