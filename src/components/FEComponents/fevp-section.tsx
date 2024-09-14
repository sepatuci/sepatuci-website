import React from 'react';
import shreya2 from "../../assets/members/delta/shreya2.jpg";


const Section: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container mx-auto flex px-5 py-24 md:flex-row flex-col items-center">
        <div className="lg:flex-grow md:w-1/2 lg:pr-24 md:pr-16 flex flex-col md:items-start md:text-left mb-16 md:mb-0 items-center text-center">
          <h1 className="title-font sm:text-4xl text-3xl mb-4 font-medium text-white">
            From our Founder&apos;s Education
            <br></br>
            Vice President
          </h1>
          <p className="text-lg text-slate-300">
          Our program is focused on collaboration and community as you get to
            build alongside your cohort. We have had members come in with no
            experience who later go on to pursue entrepreneurship full-time and
            we also have members who have started ventures before joining who go
            on to build their next startup. FE is the place where innovators at
            UCI come to build!          </p>
        </div>
        <div className="lg:max-w-lg lg:w-full md:w-1/2 w-5/6">
          <img className="object-cover object-center rounded" alt="hero" src={shreya2.src} />
        </div>
      </div>
    </section>
  );
};

export default Section;
