import React from 'react';
import { Mail, Instagram, Linkedin, Calendar, Users } from 'lucide-react';

const ContactSection: React.FC = () => {
  const contactMethods = [
    {
      icon: Mail,
      title: "Email",
      description: "Have questions? Reach out to us",
      value: "ucisep@gmail.com",
      href: "mailto:ucisep@gmail.com"
    },
    {
      icon: Instagram,
      title: "Instagram",
      description: "Follow us for updates and behind-the-scenes",
      value: "@sepatuci",
      href: "https://www.instagram.com/sepatuci/"
    },
    {
      icon: Linkedin,
      title: "LinkedIn",
      description: "Connect with our professional network",
      value: "Sigma Eta Pi at UCI",
      href: "https://www.linkedin.com/company/sepatuci/mycompany/"
    }
  ];

  return (
    <section className="bg-background section-margin">
      <div className="content-max-width section-padding">
        <div className="text-center mb-16 lg:mb-20">
          <h1 className="heading-1 mb-6">
            Join Our Next Rush
          </h1>
          <p className="body-large max-w-2xl mx-auto">
            Ready to start your entrepreneurial journey? Connect with us and stay updated on recruitment events and opportunities.
          </p>
        </div>

        {/* Contact Methods */}
        <div className="grid-premium grid-cols-1 md:grid-cols-3 mb-16">
          {contactMethods.map((method, index) => {
            const Icon = method.icon;
            return (
              <div key={index} className="group h-full">
                <div className="card-premium card-hover text-center h-full flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors duration-200">
                      <Icon className="w-8 h-8 text-accent transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-medium text-foreground mb-2">
                    {method.title}
                  </h3>
                  <p className="text-muted-foreground mb-4 flex-1">
                    {method.description}
                  </p>
                  
                  <div className="mt-auto">
                    <a 
                      href={method.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-accent hover:text-accent-foreground hover:bg-accent px-4 py-2 rounded-lg transition-all duration-200 font-medium"
                    >
                      {method.value}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <div className="card-premium max-w-2xl mx-auto">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-2xl bg-accent/10">
                <Users className="w-8 h-8 text-accent" />
              </div>
            </div>
            
            <h2 className="heading-3 mb-4">
              Ready to Get Started?
            </h2>
            <p className="body-base mb-6">
              Applications for our next recruitment cycle will be opening soon. Follow us on social media to be the first to know!
            </p>
            
            <div className="flex justify-center">
              <a
                href="https://www.instagram.com/sepatuci/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="btn-primary flex items-center">
                  <Calendar className="w-5 h-5 mr-2" />
                  Get Notified
                </button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
