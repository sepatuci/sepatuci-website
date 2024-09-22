"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import sepLogo from "../assets/logos/sep_logos/sep_white.png";
import { FaBook, FaUsers, FaRocket, FaGraduationCap } from 'react-icons/fa';
import { FaHandshakeSimple } from "react-icons/fa6";


const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-transparent fixed w-full z-10 backdrop-blur-lg">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 py-4">
          {" "}
          {/* Added py-2 to move content down */}
          <div className="flex items-center">
            <Link href="/">
              {/* Adding the logo and adjusting its size */}
              <Image
                src={sepLogo}
                alt="SEP Logo"
                width={100}
                height={40}
                className="h-10 w-auto"
              />
            </Link>
          </div>
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/founderseducation"
              className="text-white text-lg font-medium hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaBook className="inline-block mr-2" /> {/* Icon for Founder's Education */}
              Founder&apos;s Education
            </Link>

            <Link
              href="/people"
              className="text-white text-lg font-medium hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaUsers className="inline-block mr-2" /> {/* Icon for Community */}
              People
            </Link>

            <Link
              href="/brotherhood"
              className="text-white text-lg font-medium hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaHandshakeSimple className="inline-block mr-2" /> {/* Icon for Community */}
              Brotherhood
            </Link>

            <Link
              href="/rush"
              className="text-white text-lg font-medium hover:bg-gray-200 hover:text-gray-800 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaRocket className="inline-block mr-2" /> {/* Icon for Rush */}
              Rush
            </Link>

            {/* Call to Action Button */}
            <Link
              href="https://forms.gle/2k9vvXA2Gxh3J46UA" // google form here
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-medium px-6 py-2 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200">
                Apply
              </button>
            </Link>
          </div>
          {/* Mobile Menu Button */}
          <div className="mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-white hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              aria-controls="mobile-menu"
              aria-expanded={isOpen ? "true" : "false"}
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
              href="/founderseducation"
              className="text-white text-sm font-medium hover:bg-gray-200 hover:text-gray-800 block text-center px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaBook className="inline-block mr-2" /> {/* Icon for Founder's Education */}
              Founder&apos;s Education
            </Link>

            <Link
              href="/people"
              className="text-white text-sm font-medium hover:bg-gray-200 hover:text-gray-800 block text-center px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaUsers className="inline-block mr-2" /> {/* Icon for Community */}
              People
            </Link>

            <Link
              href="/brotherhood"
              className="text-white text-sm font-medium hover:bg-gray-200 hover:text-gray-800 block text-center px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaHandshakeSimple className="inline-block mr-2" /> {/* Icon for Rush */}
              Brotherhood
            </Link>

            <Link
              href="/rush"
              className="text-white text-sm font-medium hover:bg-gray-200 hover:text-gray-800 block text-center px-6 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaRocket className="inline-block mr-2" /> {/* Icon for Rush */}
              Rush
            </Link>

            {/* Mobile Call to Action Button */}
            <Link
              href="https://forms.gle/2k9vvXA2Gxh3J46UA" // google form here
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="w-full bg-gradient-to-r from-blue-900 to-purple-600 text-white text-sm font-medium px-6 py-2 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200">
                Apply
              </button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
