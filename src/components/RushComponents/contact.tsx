import React from 'react';

const ContactSection: React.FC = () => {
  return (
    <section className="bg-black pt-16">
      <div className="container px-6 py-12 mx-auto">
        <div className="text-center">
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Stay updated with recruitments and events! </h1>
        </div>

        <div className="grid grid-cols-1 gap-12 mt-10 md:grid-cols-2 lg:grid-cols-3">
          {/* Email Section */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="p-3 text-white rounded-full bg-gradient-to-r from-blue-600 to-indigo-600">
            <svg
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="w-7 h-7"
              viewBox="0 0 24 24"
            >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </span>

            <h2 className="mt-4 text-lg font-medium text-white">Email</h2>
            <p className="mt-2 text-gray-200">Questions?</p>
            <p className="mt-2 text-white">ucisep@gmail.com</p> {/* New email */}
          </div>

          {/* Instagram Section */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="p-3 text-white rounded-full bg-gradient-to-r from-blue-600 to-indigo-600">
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
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zm1.5-4.87h.01"></path> {/* Instagram logo */}
              </svg>
            </span>

            <h2 className="mt-4 text-lg font-medium text-white">Instagram</h2>
            <p className="mt-2 text-gray-200">Follow us on Instagram.</p>
            <p className="mt-2 text-white">
              <a href="https://www.instagram.com/sepatuci/" target="_blank" rel="noopener noreferrer">
                @sepatuci
              </a>
            </p> {/* Instagram link */}
          </div>

          {/* LinkedIn Section */}
          <div className="flex flex-col items-center justify-center text-center">
            <span className="p-3 text-white rounded-full bg-gradient-to-r from-blue-600 to-indigo-600">
            <svg
              fill="currentColor"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="0"
              className="w-7 h-7"
              viewBox="0 0 24 24"
            >
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"></path> {/* LinkedIn logo */}
                <circle cx="4" cy="4" r="2" stroke="none"></circle>
              </svg>
            </span>

            <h2 className="mt-4 text-lg font-medium text-white">LinkedIn</h2>
            <p className="mt-2 text-gray-200">Connect with us on LinkedIn.</p>
            <p className="mt-2 text-white">
              <a href="https://www.linkedin.com/company/sepatuci/mycompany/" target="_blank" rel="noopener noreferrer">
                Sigma Eta Pi at UCI
              </a>
            </p> {/* LinkedIn link */}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
