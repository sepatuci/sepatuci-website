import React from "react";

const TestimonialSection: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className=" px-5 py-24 mx-auto h-screen items-center justify-center flex">
        <div className="xl:w-2/3 lg:w-2/3 md:w-5/6 w-full mx-auto text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            className="inline-block w-10 h-10 text-white mb-8" // Increased icon size
            viewBox="0 0 975.036 975.036"
          >
            <path d="M925.036 57.197h-304c-27.6 0-50 22.4-50 50v304c0 27.601 22.4 50 50 50h145.5c-1.9 79.601-20.4 143.3-55.4 191.2-27.6 37.8-69.399 69.1-125.3 93.8-25.7 11.3-36.8 41.7-24.8 67.101l36 76c11.6 24.399 40.3 35.1 65.1 24.399 66.2-28.6 122.101-64.8 167.7-108.8 55.601-53.7 93.7-114.3 114.3-181.9 20.601-67.6 30.9-159.8 30.9-276.8v-239c0-27.599-22.401-50-50-50zM106.036 913.497c65.4-28.5 121-64.699 166.9-108.6 56.1-53.7 94.4-114.1 115-181.2 20.6-67.1 30.899-159.6 30.899-277.5v-239c0-27.6-22.399-50-50-50h-304c-27.6 0-50 22.4-50 50v304c0 27.601 22.4 50 50 50h145.5c-1.9 79.601-20.4 143.3-55.4 191.2-27.6 37.8-69.4 69.1-125.3 93.8-25.7 11.3-36.8 41.7-24.8 67.101l35.9 75.8c11.601 24.399 40.501 35.2 65.301 24.399z" />
          </svg>
          <p className="leading-relaxed text-xl md:text-3xl text-white">
            {" "}
            {/* Increased font size */}
            Every startup at inception was a solution to a problem. But what
            comes after that? <br /> <br /> We started Sigma Eta Pi 3 years ago
            with a singular goal of uniting the entrepreneurial of UC Irvine
            under one roof. We believed that innovation was a product of deep
            collaboration and a tight-knit community. We didn&apos;t want to
            just nurture individual creativity — we wanted to unite thinkers,
            doers, and creators to push each other beyond their own boundaries.
            And in that process, create something that left a lasting impact,
            not only on themselves, but on the world around them. <br />
            <br /> Sigma Eta Pi is the place that people come to when they want
            to build with the brightest and most innovative minds at UCI. Our
            mission, as it has always been, is to empower students to pursue
            their entrepreneurial dreams. Maybe you&apos;re the next one…
          </p>
          <span className="inline-block h-1 w-10 rounded bg-indigo-500 mt-8 mb-6"></span>
          <h2 className="text-white font-medium title-font tracking-wider text-4xl">
            {" "}
            {/* Increased font size */}
            Ayaan
          </h2>
          <p className="text-gray-400 text-2xl italic">
            {" "}
            {/* Increased font size */}
            President
          </p>
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;
