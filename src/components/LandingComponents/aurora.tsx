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
          <div className="text-3xl md:text-7xl font-bold dark:text-white text-center">
            UCI&apos;s Premier Entrepreneurship Fraternity
          </div>
          <a
            href="https://google.com" // Add google form
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="bg-gradient-to-r from-blue-900 to-purple-600 text-white text-lg font-medium px-6 py-5 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200">
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
  