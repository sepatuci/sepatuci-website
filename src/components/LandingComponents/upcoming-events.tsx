"use client";

import { motion } from "framer-motion";
import { CalendarDays, MapPin, Clock, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import eventImage from "@/assets/community/mvp-event.avif";

export default function UpcomingEvents() {
  return (
    <section id="events" className="bg-black section-padding scroll-mt-36">
      <div className="content-max-width">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="heading-2 text-foreground mb-4">Upcoming Events</h2>
          <p className="body-large max-w-2xl mx-auto">
            Join us at our next event and connect with UCI&apos;s startup community.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-3xl mx-auto"
        >
          <a
            href="https://luma.com/hipqe3z9"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col sm:flex-row bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden hover:border-accent/30 transition-all duration-300 hover:shadow-lg hover:shadow-accent/5 group"
          >
            <div className="relative w-full sm:w-56 md:w-64 shrink-0 aspect-square">
              <Image
                src={eventImage}
                alt="Build + Ship Your MVP: Idea to Product"
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                sizes="256px"
              />
            </div>

            <div className="p-6 md:p-8 flex flex-col justify-center">
              <h3 className="text-xl md:text-2xl font-light text-foreground mb-3 leading-tight group-hover:text-accent transition-colors duration-300">
                Build + Ship Your MVP: Idea to Product
              </h3>

              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-sm">Wednesday, March 4</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-sm">6:00 – 7:30 PM</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-sm">Donald Bren Hall, UCI</span>
                </div>
              </div>

              <div>
                <div className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5">
                  <span>RSVP</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
