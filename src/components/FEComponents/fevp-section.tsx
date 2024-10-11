import React from 'react';
import Image from 'next/image'; // Importing Image from next/image
import shreya2 from "../../assets/members/delta/shreya2.jpg";

const Section: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container mx-auto flex px-5 py-24 md:flex-row flex-col items-center">
        <div className="lg:flex-grow md:w-1/2 lg:pr-24 md:pr-16 flex flex-col md:items-center md:text-left mb-16 md:mb-0 items-center text-center">
          <h1 className="text-center title-font sm:text-5xl text-3xl mb-4 font-medium text-white">
            From Our VP of
            <br></br>
            Founder&apos;s Education
          </h1>
          <p className="text-center md:text-2xl text-lg text-slate-300">
            Founder&apos;s Education is focused on developing our newest members
            personally and professionally, by fostering a tight-knit community.
            Designed for all experience levels, FE is the go-to program for
            those of you at UCI looking to innovate, learn about the startup
            world, and meet some dynamic people!{" "}
          </p>
        </div>
        <div className="lg:max-w-lg lg:w-full md:w-1/2 w-5/6">
          <Image
            className="object-cover object-center rounded-md"
            alt="hero"
            src={shreya2.src}
            width={500} // Provide appropriate width for the image
            height={500} // Provide appropriate height for the image
            priority={true} // Optional: to prioritize this image for faster LCP
          />
        </div>
      </div>
    </section>
  );
};

export default Section;
