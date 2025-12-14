import React from 'react';
import { Search, Users, TrendingUp, Puzzle, DollarSign, MessageCircle, Presentation, Globe } from 'lucide-react';

const MainFE: React.FC = () => {
  const programModules = [
    {
      icon: Search,
      title: "Problem Discovery",
      description: "Learn to identify real problems worth solving in your community"
    },
    {
      icon: Users,
      title: "Customer Discovery",
      description: "Conduct user interviews and understand your target market"
    },
    {
      icon: Puzzle,
      title: "Minimum Viable Product",
      description: "Build and ship your first MVP to real users"
    },
    {
      icon: TrendingUp,
      title: "Market Analysis",
      description: "Research competitors and find your market opportunity"
    },
    {
      icon: DollarSign,
      title: "Startup Finance",
      description: "Learn fundraising, unit economics, and financial planning"
    },
    {
      icon: Globe,
      title: "Branding & Marketing",
      description: "Create a compelling brand and go-to-market strategy"
    },
    {
      icon: MessageCircle,
      title: "Founder Networking",
      description: "Connect with VCs, mentors, and UCI alumni founders"
    },
    {
      icon: Presentation,
      title: "Pitch Training",
      description: "Master your pitch deck and present to real investors"
    }
  ];

  return (
    <section className="bg-background section-margin">
      <div className="content-max-width section-padding">
        <div className="text-center mb-16 lg:mb-20">
          <h1 className="heading-1 mb-6">
            UCI&apos;s Student-Run Startup Incubator
          </h1>
          <p className="body-large max-w-3xl mx-auto mb-6">
            Founder&apos;s Education is our 8-week startup incubator program at UC Irvine. Learn to think and build like an entrepreneur through hands-on experience—no business background required.
          </p>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Our program has helped launch 20+ startups and raised over $1M in funding. Whether you&apos;re a CS major with a product idea or a designer wanting to start a company, FE gives you the framework to build.
          </p>
        </div>
        
        <div className="grid-premium grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {programModules.map((module, index) => {
            const Icon = module.icon;
            return (
              <div key={index} className="group">
                <div className="card-premium card-hover text-center h-full flex flex-col">
                  <div className="flex justify-center mb-6">
                    <div className="p-4 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors duration-200">
                      <Icon className="w-10 h-10 text-accent transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-lg font-medium text-foreground mb-3 leading-tight">
                      {module.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {module.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MainFE;
