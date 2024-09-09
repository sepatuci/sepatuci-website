"use client";

import React from "react";
import ayaan from "../assets/members/alpha/ayaan.jpg";
import { HoverEffect } from "../components/ui/card-hover-effect";

export const curriculumItems = [
  { title: "Problem Discovery" },
  { title: "Customer Discovery" },
  { title: "Minimum Viable Product" },
  { title: "Market Analysis" },
  { title: "Finance" },
  { title: "Branding" },
  { title: "Networking" },
  { title: "Pitching" },
];

function FoundersEducation() {
  return (
    <div className="overflow-y-auto h-auto">
      <div className="flex flex-col mx-auto text-center justify-center items-center min-h-screen py-10">
        <h1 className="md:text-7xl sm:text-6xl text-5xl font-bold md:py-6 sm:py-4 py-2 text-white">
          Founder's Education
        </h1>
        <p className="md:text-4xl sm:text-3xl text-2xl font-bold text-slate-300">
          Our 8-week startup accelerator program focused on
          helping you think and build like an entrepreneur.
        </p>
      </div>
      <div className="h-fit w-fit flex flex-col items-center justify-center max-w-5xl mx-auto px-8">
          <HoverEffect items={curriculumItems} />
        </div>
    </div>
  );
}

export default FoundersEducation;
