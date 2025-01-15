"use client";

import { motion } from "framer-motion";
import React from "react";
import { AuroraBackground } from "../ui/aurora-background";

export function AuroraBackgroundDemo() {
  const words = ["Founders", "Innovators", "Builders"];
  return (
    <div>
      <AuroraBackground>
        <motion.div
          initial={{ opacity: 0.0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0,
            duration: 0.2,
            ease: "easeInOut",
          }}
          className="relative flex flex-col gap-4 items-center justify-center px-4"
        >
          <div className="text-5xl md:text-8xl font-bold dark:text-white text-center">
            Sigma Eta Pi
          </div>
          <div className="text-xl md:text-3xl italic dark:text-white text-center">
            UCI&apos;s Premier Entrepreneurship Fraternity
          </div>
          <a
            href="https://forms.gle/jD2pGM4QUmZ6p8Fq9" // Add google form
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="bg-[#ae201b] text-white text-lg font-medium px-6 py-5 rounded-lg shadow-md hover:bg-[#8a2521] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200">
              Interested?
            </button>
          </a>
        </motion.div>
      </AuroraBackground>
    </div>
  );

}

export const projects = [
    {
      title: "40+",
      description:
        "Community Members",
    },
    {
      title: "15+",
      description:
        "Majors",
    },
    {
      title: "20+",
      description:
        "Startups",
    },
    {
      title: "10+",
      description:
        "Countries",
    },
    {
      title: "$1M+",
      description:
        "In Funding",
    },
    {
      title: "1",
      description:
        "Family",
    },
  ];
  