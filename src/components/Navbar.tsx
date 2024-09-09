"use client";

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import sepLogo from '../assets/logos/sep_logos/sep_white.png'; // Import your logo

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-transparent fixed w-full z-10 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/">
              {/* Adding the logo */}
              <Image src={sepLogo} alt="SEP Logo" width={120} height={40} />
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <Link
                href="/about"
                className="text-white hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                About
              </Link>
              <Link
                href="/projects"
                className="text-white hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                Projects
              </Link>
              <Link
                href="/contact"
                className="text-white hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                Contact
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-white hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              aria-controls="mobile-menu"
              aria-expanded={isOpen ? 'true' : 'false'}
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16m-7 6h7"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link
              href="/about"
              className="text-white hover:bg-gray-200 hover:text-gray-800 block px-3 py-2 rounded-md text-base font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              About
            </Link>
            <Link
              href="/projects"
              className="text-white hover:bg-gray-200 hover:text-gray-800 block px-3 py-2 rounded-md text-base font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              Projects
            </Link>
            <Link
              href="/contact"
              className="text-white hover:bg-gray-200 hover:text-gray-800 block px-3 py-2 rounded-md text-base font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              Contact
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
