import React from 'react';
import { Search, Users, TrendingUp, Puzzle, DollarSign, MessageCircle, Presentation, Globe } from 'lucide-react';

const MainFE: React.FC = () => {
  const programModules = [
    {
      icon: Search,
      title: "Problem Discovery",
      description: "Identify real problems worth solving"
    },
    {
      icon: Users,
      title: "Customer Discovery",
      description: "Understand your target audience"
    },
    {
      icon: Puzzle,
      title: "Minimum Viable Product",
      description: "Build and validate your solution"
    },
    {
      icon: TrendingUp,
      title: "Market Analysis",
      description: "Research competitive landscape"
    },
    {
      icon: DollarSign,
      title: "Finance",
      description: "Master startup financial planning"
    },
    {
      icon: Globe,
      title: "Branding",
      description: "Create compelling brand identity"
    },
    {
      icon: MessageCircle,
      title: "Networking",
      description: "Build meaningful connections"
    },
    {
      icon: Presentation,
      title: "Pitching",
      description: "Present your vision effectively"
    }
  ];

  return (
    <section className="bg-background section-margin">
      <div className="content-max-width section-padding">
        <div className="text-center mb-16 lg:mb-20">
          <h1 className="heading-1 mb-6">
            The Program
          </h1>
          <p className="body-large max-w-3xl mx-auto">
            Founder's Education is our 8-week startup incubator program focused on helping you think and build like an entrepreneur.
          </p>
        </div>
        
        <div className="grid-premium grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {programModules.map((module, index) => {
            const Icon = module.icon;
            return (
              <div key={index} className="group">
                <div className="card-premium card-hover text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors duration-200">
                      <Icon className="w-8 h-8 text-accent transition-transform duration-200 group-hover:scale-110" />
                    </div>
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {module.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {module.description}
                  </p>
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
