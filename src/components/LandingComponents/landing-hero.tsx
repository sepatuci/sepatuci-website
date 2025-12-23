"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Rocket, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuroraBackground } from "../ui/aurora-background";
import CountUp from "react-countup";

export default function LandingHero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-28 sm:pt-24 lg:pt-20">
      {/* Aurora Background */}
      <div className="absolute inset-0 opacity-30">
        <AuroraBackground showRadialGradient={true}>
          <div />
        </AuroraBackground>
      </div>

      <div className="relative z-10 content-max-width section-padding w-full">
        <div className="text-center max-w-5xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex justify-center mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm text-accent font-medium">Sigma Eta Pi at UCI</span>
            </div>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="heading-1 mb-6"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
              UCI&apos;s Home for{" "}
            </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent/80 to-accent/60">
              Builders
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="body-large max-w-3xl mx-auto mb-12"
          >
            A community for students who want to create, launch, and lead. Whether you&apos;re building your first product or scaling your next idea, SEP gives you the people, tools, and momentum to make it real.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap justify-center gap-4 mb-20"
          >
            <Link href="https://www.instagram.com/sepatuci/" target="_blank" rel="noopener noreferrer">
              <button className="btn-primary group flex items-center gap-2 relative overflow-hidden">
                <span className="relative z-10">Learn More</span>
                <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent/20 to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            </Link>
            <Link href="/founderseducation">
              <button className="btn-secondary group relative overflow-hidden">
                <span className="relative z-10">Founder&apos;s Education</span>
                <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            </Link>
          </motion.div>

          {/* Quick Stats with Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto"
          >
            {[
              { value: 40, suffix: "+", label: "Members", icon: Users },
              { value: 20, suffix: "+", label: "Startups Launched", icon: Rocket },
              { value: 1, prefix: "$", suffix: "M+", label: "Funding Raised", icon: Sparkles },
              { value: 15, suffix: "+", label: "Majors", icon: Sparkles }
            ].map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  className="group"
                >
                  <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-6 hover:border-accent/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent/5">
                    <div className="absolute -top-3 -right-3 p-2 rounded-lg bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                    <div className="text-3xl sm:text-4xl font-light text-foreground mb-2 group-hover:text-accent transition-colors duration-300">
                      {stat.prefix}
                      <CountUp 
                        start={0}
                        end={stat.value} 
                        duration={4.5}
                        enableScrollSpy
                        scrollSpyOnce
                        scrollSpyDelay={100}
                      >
                        {({ countUpRef }) => <span ref={countUpRef} />}
                      </CountUp>
                      {stat.suffix}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider">
                      {stat.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

      </div>
    </section>
  );
}
