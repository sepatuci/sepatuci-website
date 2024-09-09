import React, { Suspense } from 'react';
import ariya from "../assets/members/epsilon/ariya.jpg";
import ayaan from "../assets/members/alpha/ayaan.jpg";
import antonio from "../assets/members/epsilon/antonio.jpg";
import byren from "../assets/members/delta/byren.jpg";
import caleb from "../assets/members/epsilon/caleb.jpg";
import daniel from "../assets/members/delta/daniel.jpg";
import delphine from "../assets/members/epsilon/delphine.jpg";
import felix from "../assets/members/epsilon/felix.jpg";
import hoon from "../assets/members/zeta/hoon.jpg";
import jessicahu from "../assets/members/epsilon/jessicahu.jpg";
import jessicatam from "../assets/members/epsilon/jessicatam.jpg";
import joseph from "../assets/members/epsilon/joseph.jpg";
import kai from "../assets/members/delta/kai.jpg";
import kyleking from "../assets/members/zeta/kyle.jpg";
import nima from "../assets/members/beta/nima.jpg";
import pahel from "../assets/members/epsilon/pahel.jpg";
import richard from "../assets/members/zeta/richard.jpg";
import rohit from "../assets/members/zeta/rohit.jpg";
import shreya from "../assets/members/delta/shreya.jpg";
import yurina from "../assets/members/zeta/yurina.jpg";
import jose from "../assets/members/zeta/jose.jpg";
import hannah from "../assets/members/zeta/hannah.jpg";
import gabrielle from "../assets/members/zeta/gaby.jpg";

interface TeamMember {
  description: string;
  title: string;
  src: string;
  ctaLink: string;
}

const teamMembers: TeamMember[] = [
  // Alpha Class
  {
    description: "Alpha Class",
    title: "Ayaan Dhir",
    src: ayaan.src,
    ctaLink: "https://www.linkedin.com/in/ayaandhir/",
  },
  // Beta Class
  {
    description: "Beta Class",
    title: "Nima Movahedi",
    src: nima.src,
    ctaLink: "https://www.linkedin.com/in/nima-movahedi/",
  },
  // Delta Class
  {
    description: "Delta Class",
    title: "Byren Cheema",
    src: byren.src,
    ctaLink: "https://www.linkedin.com/in/byren-cheema-255a25215/",
  },
  {
    description: "Delta Class",
    title: "Daniel Yi",
    src: daniel.src,
    ctaLink: "https://www.linkedin.com/in/daniel-yi-2a527223a",
  },
  {
    description: "Delta Class",
    title: "Kai Meyers",
    src: kai.src,
    ctaLink: "https://www.linkedin.com/in/kai-meyers/",
  },
  {
    description: "Delta Class",
    title: "Shreya Mawandia",
    src: shreya.src,
    ctaLink: "https://www.linkedin.com/in/shreyamawandia/",
  },
  // Epsilon Class
  {
    description: "Epsilon Class",
    title: "Antonio Li",
    src: antonio.src,
    ctaLink: "https://www.linkedin.com/in/antonioli1/",
  },
  {
    description: "Epsilon Class",
    title: "Ariya Gowda",
    src: ariya.src,
    ctaLink: "https://www.linkedin.com/in/ariya-gowda-b20485225/",
  },
  {
    description: "Epsilon Class",
    title: "Caleb Chung",
    src: caleb.src,
    ctaLink: "https://www.linkedin.com/in/caleb-chung-7796941a0/",
  },
  {
    description: "Epsilon Class",
    title: "Delphine Tai-Beauchamp",
    src: delphine.src,
    ctaLink: "https://www.linkedin.com/in/delphinetb/",
  },
  {
    description: "Epsilon Class",
    title: "Felix Toffaneto Werner",
    src: felix.src,
    ctaLink: "https://www.linkedin.com/in/felixtwerner/",
  },
  {
    description: "Epsilon Class",
    title: "Jessica Hu",
    src: jessicahu.src,
    ctaLink: "https://www.linkedin.com/in/jessica-hu-a85557276/",
  },
  {
    description: "Epsilon Class",
    title: "Jessica Tam",
    src: jessicatam.src,
    ctaLink: "https://www.linkedin.com/in/jessica-tam-704240281/",
  },
  {
    description: "Epsilon Class",
    title: "Joseph Marquez",
    src: joseph.src,
    ctaLink: "https://www.linkedin.com/in/joseph-marquez-6009a2262/",
  },
  {
    description: "Epsilon Class",
    title: "Pahel Srivastava",
    src: pahel.src,
    ctaLink: "https://www.linkedin.com/in/pahel-patel-9474b822a/",
  },
  // Zeta Class
  {
    description: "Zeta Class",
    title: "Gabrielle Palar",
    src: gabrielle.src,
    ctaLink: "https://www.linkedin.com/in/gabrielle-palar/",
  },
  {
    description: "Zeta Class",
    title: "Hannah McCarthy",
    src: hannah.src,
    ctaLink: "https://www.linkedin.com/in/hannah-mccarthy-6101a22ba/",
  },
  {
    description: "Zeta Class",
    title: "Junghoon Kim",
    src: hoon.src,
    ctaLink: "www.linkedin.com/in/hoononthemoon",
  },
  {
    description: "Zeta Class",
    title: "Kyle King",
    src: kyleking.src,
    ctaLink: "https://www.linkedin.com/in/king-kyle/",
  },
  {
    description: "Zeta Class",
    title: "Richard Hunt",
    src: richard.src,
    ctaLink: "https://www.linkedin.com/in/richardcarlhunt/",
  },
  {
    description: "Zeta Class",
    title: "Rohit De",
    src: rohit.src,
    ctaLink: "https://www.linkedin.com/in/rohitde/",
  },
  {
    description: "Zeta Class",
    title: "Yurina Tamura",
    src: yurina.src,
    ctaLink: "http://www.linkedin.com/in/yurina-tamura",
  },
  {
    description: "Zeta Class",
    title: "Jose Callejas",
    src: jose.src,
    ctaLink: "https://www.linkedin.com/in/jose-mizraim-callejas-gonzalez-371987212/",
  },
  {
    description: "Zeta Class",
    title: "Becca Sakoda",
    src: joseph.src,
    ctaLink: "https://www.linkedin.com/in/rebeccasakoda",
  },
];

const Skeleton = () => {
  return (
    <div className="p-4 lg:w-1/5 md:w-1/2">
      <div className="h-full flex flex-col items-center text-center">
        <div className="flex-shrink-0 rounded-lg w-full h-56 bg-gray-300 mb-4"></div>
        <div className="w-full">
          <div className="bg-gray-400 h-4 w-24 mb-2 rounded"></div>
          <div className="bg-gray-400 h-4 w-16 mb-4 rounded"></div>
        </div>
      </div>
    </div>
  );
};

const TeamSection: React.FC = () => {
  return (
    <section className="text-white body-font bg-black">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="text-2xl font-medium title-font mb-4 text-white">OUR TEAM</h1>
          <p className="lg:w-2/3 mx-auto leading-relaxed text-base text-white">
            Meet our amazing team members.
          </p>
        </div>
        <div className="flex flex-wrap -m-4">
          <Suspense fallback={<Skeleton />}>
            {teamMembers.map((member, index) => (
              <div className="p-4 lg:w-1/5 md:w-1/2" key={index}>
                <div className="h-full flex flex-col items-center text-center">
                  <img
                    alt="team"
                    className="flex-shrink-0 rounded-lg w-full h-56 object-cover object-center mb-4"
                    src={member.src}
                  />
                  <div className="w-full">
                    <h2 className="title-font font-medium text-lg text-white">{member.title}</h2>
                    <h3 className="text-gray-400 mb-3">{member.description}</h3>
                    <span className="inline-flex">
                      <a href={member.ctaLink} className="text-gray-500" target="_blank" rel="noopener noreferrer">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="currentColor"
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                        >
                          <path d="M16 8a6 6 0 01-12 0 6 6 0 1112 0zM2 12v9h4v-9H2zm7-5a2 2 0 110-4 2 2 0 010 4zm0 2H9v9h4v-9H9v-2z" />
                        </svg>
                      </a>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Suspense>
        </div>
      </div>
    </section>
  );
};

export default TeamSection;
