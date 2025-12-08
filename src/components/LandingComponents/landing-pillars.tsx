"use client";

import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import { Lightbulb, Rocket, Users } from "lucide-react";
import grouppic from "@/assets/community/grouppic.jpeg";
import aifinals from "@/assets/community/aifinals.jpeg";
import sittingOnRock from "@/assets/community/utahSittingOnRock.jpeg";

const pillars = [
  {
    icon: Lightbulb,
    title: "Innovators",
    description:
      "We build startups every quarter through our Founder's Education program to solve problems in our communities. Innovation is at the core of our mission as we work towards launching UCI's next unicorn.",
    image: grouppic
  },
  {
    icon: Rocket,
    title: "Creators",
    description:
      "Our startups have raised over $2M+ in VC funding, accelerator programs, and competitions. We want to build startups with real impact together and we aren't afraid to show it.",
    image: aifinals
  },
  {
    icon: Users,
    title: "Community",
    description:
      "At the core of our organization, we are a big family. We build startups together, we go on adventures together, and we push each other to new heights. At Sigma Eta Pi, it's the people that make it special.",
    image: sittingOnRock
  }
];

export default function LandingPillars() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="bg-background section-margin">
      <div className="content-max-width section-padding">
        {/* Section Header */}
        <div className="text-center mb-16 lg:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="heading-2 mb-6"
          >
            What Drives Us
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="body-large max-w-3xl mx-auto"
          >
            Three pillars that define who we are and what we stand for
          </motion.p>
        </div>

        {/* Pillars Grid */}
        <div className="grid-premium grid-cols-1 lg:grid-cols-3">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group"
              >
                <div className="card-premium card-hover h-full flex flex-col">
                  {/* Image */}
                  <div className="relative w-full aspect-video mb-6 rounded-xl overflow-hidden bg-muted/20">
                    <Image
                      src={pillar.image}
                      alt={pillar.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-60" />
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors duration-200">
                      <Icon className="w-10 h-10 text-accent transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col text-center">
                    <h3 className="heading-3 mb-4">
                      {pillar.title}
                    </h3>
                    <p className="body-base leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
