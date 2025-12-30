# Sigma Eta Pi @ UC Irvine Website

The official website for Sigma Eta Pi (ΣΗΠ) at UC Irvine 

## 🚀 About

This website showcases our fraternity's mission to foster entrepreneurial spirit, innovation, and brotherhood among UC Irvine students. Built with modern web technologies to provide an engaging experience for prospective members, current brothers, and the broader community.

## 🛠 Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **Runtime**: Bun
- **Styling**: Tailwind CSS with custom animations
- **UI Components**: Radix UI, shadcn/ui
- **Animations**: Framer Motion
- **Image Optimization**: Next.js Image component
- **Icons**: Lucide React, FontAwesome
- **Deployment**: Vercel

## 🏗 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) 1.0+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sepatuci/sepatuci-website.git
cd sepatuci-website
```

2. Install dependencies:
```bash
bun install
```

3. Run the development server:
```bash
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── brotherhood/        # Brotherhood page
│   ├── founderseducation/  # Founder's Education page
│   ├── people/             # Members page
│   └── rush/               # Rush information page
├── components/             # React components
│   ├── BrotherhoodComponents/
│   ├── FEComponents/
│   ├── LandingComponents/
│   ├── PeopleComponents/
│   ├── RushComponents/
│   └── ui/                 # Reusable UI components
├── assets/                 # Images and static files
└── lib/                    # Utility functions
```

## 📝 Blog

Add posts by creating `.mdx` files in `src/content/blog/`:

```mdx
export const metadata = {
  title: "Post Title",
  description: "Brief description for SEO",
  date: "2025-01-15",
  author: "SEP at UCI",
};

# Your Content

Write markdown here with **bold**, [links](/rush), etc.
```

## 🎨 Features



## 🚀 Deployment

The site is automatically deployed to Vercel on every push to the main branch.

### Manual Deployment

```bash
bun run build
bun run start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention
We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Test changes
- `chore:` - Build process or auxiliary tool changes

## 📞 Contact

- **Website**: [sepatuci.com](https://sepatuci.com)
- **Instagram**: [@sepatuci](https://instagram.com/sepatuci)
- **LinkedIn**: [Sigma Eta Pi @ UCI](https://www.linkedin.com/company/sepatuci/)

## 📄 License

This project is private and proprietary to Sigma Eta Pi @ UC Irvine.

---

Built with ❤️ by the Sigma Eta Pi @ UCI Tech Team