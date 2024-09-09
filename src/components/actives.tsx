"use client";

import React from 'react';

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
  name: string;
  role: string;
  description: string;
  imgSrc: string;
}

const teamMembers: TeamMember[] = [
  {
    name: 'Holden Caulfield',
    role: 'UI Developer',
    description: 'DIY tote bag drinking vinegar cronut adaptogen squid fanny pack vaporware.',
    imgSrc: 'https://dummyimage.com/200x200',
  },
  {
    name: 'Alper Kamu',
    role: 'Designer',
    description: 'DIY tote bag drinking vinegar cronut adaptogen squid fanny pack vaporware.',
    imgSrc: 'https://dummyimage.com/201x201',
  },
  {
    name: 'Atticus Finch',
    role: 'UI Developer',
    description: 'DIY tote bag drinking vinegar cronut adaptogen squid fanny pack vaporware.',
    imgSrc: 'https://dummyimage.com/204x204',
  },
  {
    name: 'Henry Letham',
    role: 'Designer',
    description: 'DIY tote bag drinking vinegar cronut adaptogen squid fanny pack vaporware.',
    imgSrc: 'https://dummyimage.com/206x206',
  },
];

const TeamSection: React.FC = () => {
  return (
    <section className="text-gray-400 bg-gray-900 body-font">
      <div className="container px-5 py-24 mx-auto">
        <div className="flex flex-col text-center w-full mb-20">
          <h1 className="text-2xl font-medium title-font mb-4 text-white tracking-widest">OUR TEAM</h1>
          <p className="lg:w-2/3 mx-auto leading-relaxed text-base">
            Whatever cardigan tote bag tumblr hexagon brooklyn asymmetrical gentrify, subway tile poke farm-to-table. Franzen you probably haven't heard of them.
          </p>
        </div>
        <div className="flex flex-wrap -m-4">
          {teamMembers.map((member, index) => (
            <div key={index} className="p-4 lg:w-1/2">
              <div className="h-full flex sm:flex-row flex-col items-center sm:justify-start justify-center text-center sm:text-left">
                <img
                  alt={member.name}
                  className="flex-shrink-0 rounded-lg w-48 h-48 object-cover object-center sm:mb-0 mb-4"
                  src={member.imgSrc}
                />
                <div className="flex-grow sm:pl-8">
                  <h2 className="title-font font-medium text-lg text-white">{member.name}</h2>
                  <h3 className="text-gray-500 mb-3">{member.role}</h3>
                  <p className="mb-4">{member.description}</p>
                  <span className="inline-flex">
                    <a className="text-gray-500" href="#">
                      <svg
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                      >
                        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"></path>
                      </svg>
                    </a>
                    <a className="ml-2 text-gray-500" href="#">
                      <svg
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                      >
                        <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"></path>
                      </svg>
                    </a>
                    <a className="ml-2 text-gray-500" href="#">
                      <svg
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                      >
                        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"></path>
                      </svg>
                    </a>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TeamSection;


// const cards = [
//   // A
// {
//     description: "Alpha Class",
//     title: "Ayaan Dhir",
//     src: ayaan,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/ayaandhir/",
//     content: () => {
//       return (
//         <p>
//           Ayaan Dhir
//         </p>
//       );
//     },
//   },
  
//   {
//     description: "Beta Class",
//     title: "Antonio Li",
//     src: antonio,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/antonioli1/",
//     content: () => {
//       return (
//         <p>
//           Antonio Li
//         </p>
//       );
//     },
//   },
  
  
//   {
//     description: "Epsilon Class",
//     title: "Ariya Gowda",
//     src: ariya,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/ariya-gowda-b20485225/",
//     content: () => {
//       return (
//         <p>
//           Ariya Gowda
//         </p>
//       );
//     },
//   },
  
//   // B
  
//   {
//     description: "Delta Class",
//     title: "Byren Cheema",
//     src: byren,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/byren-cheema-255a25215/",
//     content: () => {
//       return (
//         <p>
//           Byren Cheema
//         </p>
//       );
//     },
//   },
  
//   // C
//   {
//     description: "Epsilon Class",
//     title: "Caleb Chung",
//     src: caleb,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/caleb-chung-7796941a0/",
//     content: () => {
//       return (
//         <p>
//           Caleb Chung
//         </p>
//       );
//     },
//   },
  
  
//   // D
  
//   {
//     description: "Delta Class",
//     title: "Daniel Yi",
//     src: daniel,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/daniel-yi-2a527223a",
//     content: () => {
//       return (
//         <p>
//           Daniel Yi
//         </p>
//       );
//     },
//   },
//   {
//     description: "Epsilon Class",
//     title: "Delphine Tai-Beauchamp",
//     src: delphine,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/delphinetb/",
//     content: () => {
//       return (
//         <p>
//           Delphine Tai-Beauchamp
//         </p>
//       );
//     },
//   },
  
//   // E
  
  
//   // F
//   {
//     description: "Epsilon Class",
//     title: "Felix Toffaneto Werner",
//     src: felix,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/felixtwerner/",
//     content: () => {
//       return (
//         <p>
//           Felix Toffaneto Werner
//         </p>
//       );
//     },
//   },
  
//   // G
//   {
//     description: "Zeta Class",
//     title: "Gabrielle Palar",
//     src: gabrielle,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/gabrielle-palar/",
//     content: () => {
//       return (
//         <p>
//           Gabrielle Palar
//         </p>
//       );
//     },
//   },
  
//   // H
//   {
//     description: "Zeta Class",
//     title: "Hannah McCarthy",
//     src: hannah,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/hannah-mccarthy-6101a22ba/",
//     content: () => {
//       return (
//         <p>
//           Hannah McCarthy
//         </p>
//       );
//     },
//   },
//   {
//     description: "Zeta Class",
//     title: "Hoon Kim",
//     src: hoon,
//     ctaText: "LinkedIn",
//     ctaLink: "www.linkedin.com/in/hoononthemoon",
//     content: () => {
//       return (
//         <p>
//           Hoon Kim
//         </p>
//       );
//     },
//   },
  
//   // I
  
  
  
//   // J
  
//   {
//     description: "Epsilon Class",
//     title: "Jessica Hu",
//     src: jessicahu,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/jessica-hu-a85557276/",
//     content: () => {
//       return (
//         <p>
//           Jessica Hu
//         </p>
//       );
//     },
//   },
//   {
//     description: "Epsilon Class",
//     title: "Jessica Tam",
//     src: jessicatam,
//     ctaText: "LinkedIn",
//     ctaLink:   "https://www.linkedin.com/in/jessica-tam-704240281/",
//     content: () => {
//       return (
//         <p>
//           Jessica Tam
//         </p>
//       );
//     },
//   },
//   {
//     description: "Epsilon Class",
//     title: "Joseph Marquez",
//     src: joseph,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/joseph-marquez-6009a2262/",
//     content: () => {
//       return (
//         <p>
//           Joseph Marquez
//         </p>
//       );
//     },
//   },
  
//   // K
  
//   {
//     description: "Delta Class",
//     title: "Kai Meyers",
//     src: kai,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/kai-meyers/",
//     content: () => {
//       return (
//         <p>
//           Kai Meyers
//         </p>
//       );
//     },
//   },
//   {
//     description: "Zeta Class",
//     title: "Kyle King",
//     src: kyleking,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/king-kyle/",
//     content: () => {
//       return (
//         <p>
//           Kyle King
//         </p>
//       );
//     },
//   },
 
  
//   // M
  
//   {
//     description: "Beta Class",
//     title: "Nima Movahedi",
//     src: nima,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/nima-movahedi/",
//     content: () => {
//       return (
//         <p>
//           Nima Movahedi
//         </p>
//       );
//     },
//   },
  
  
  
//   // R
  
//   {
//     description: "Zeta Class",
//     title: "Richard Hunt",
//     src: richard,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/richardcarlhunt/",
//     content: () => {
//       return (
//         <p>
//           Richard Hunt
//         </p>
//       );
//     },
//   },
  
//   {
//     description: "Zeta Class",
//     title: "Rohit De",
//     src: rohit,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/rohitde/",
//     content: () => {
//       return (
//         <p>
//           Rohit De
//         </p>
//       );
//     },
//   },

  


//   {
//     description: "Delta Class",
//     title: "Shreya Mawandia",
//     src: shreya,
//     ctaText: "LinkedIn",
//     ctaLink: "https://www.linkedin.com/in/shreyamawandia/",
//     content: () => {
//       return (
//         <p>
//           Shreya Mawandia
//         </p>
//       );
//     },
//   },

  

  
  
    
// ];
