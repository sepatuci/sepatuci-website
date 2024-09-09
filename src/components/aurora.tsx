"use client";

import { motion } from "framer-motion";
import React from "react";
import { AuroraBackground } from "./ui/aurora-background";
import { FlipWords } from "./ui/flip-words";


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
        <div className="text-3xl md:text-7xl font-bold dark:text-white text-center">
            UCI's Premier Entrepreneurship Fraternity
        </div>
        {/* <div className="text-4xl md:text-7xl font-normal text-neutral-600 dark:text-neutral-400">
        <FlipWords words={words} /> <br />
      </div> */}
        <button className="bg-black dark:bg-white rounded-full w-fit text-white dark:text-black px-4 py-2">
          Get Started
        </button>
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
  