import React from 'react';
import sepLogo from '../assets/logos/sep_logos/sep_white.png'; // Import your logo image

const Footer: React.FC = () => {
  return (
    <footer className="text-white body-font bg-transparent backdrop-blur-lg">
      <div className="container px-8 py-12 mx-auto flex items-center sm:flex-row flex-col">
        <a className="flex title-font font-medium items-center md:justify-start justify-center text-white">
          {/* Replace SVG with the image */}
          <img 
            src={sepLogo.src}
            alt="SEP @ UCI Logo" 
            className="w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full p-2"
          />
          <span className="ml-4 text-2xl">Sigma Eta Pi @ UC Irvine</span>
        </a>
        <p className="text-lg text-gray-400 sm:ml-6 sm:pl-6 sm:border-l-2 sm:border-gray-600 sm:py-2 sm:mt-0 mt-4">
          © 2024
          <a
            href="https://www.instagram.com/sepatuci/"
            className="text-gray-400 ml-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            @sepatuci
          </a>
        </p>
        <span className="inline-flex sm:ml-auto sm:mt-0 mt-4 justify-center sm:justify-start">
          {/* INSTAGRAM */}
          <a
            href="https://www.instagram.com/sepatuci/"
            rel="noopener noreferrer"
            target="_blank"
            className="ml-5 text-gray-400"
          >
            <svg
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="w-7 h-7"
              viewBox="0 0 24 24"
            >
              <rect width="22" height="22" x="1" y="1" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zm1.5-4.87h.01"></path>
            </svg>
          </a>

          {/* LINKEDIN */}
          <a
            href="https://www.linkedin.com/company/sepatuci/mycompany/"
            rel="noopener noreferrer"
            target="_blank"
            className="ml-5 text-gray-400"
          >
            <svg
              fill="currentColor"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="0"
              className="w-7 h-7"
              viewBox="0 0 24 24"
            >
              <path
                stroke="none"
                d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"
              ></path>
              <circle cx="4" cy="4" r="2" stroke="none"></circle>
            </svg>
          </a>
        </span>
      </div>
    </footer>
  );
};

export default Footer;
