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

## Blog Pipeline

The blog page is powered by an automated pipeline that fetches top stories from Hacker News, clusters related stories by topic, and synthesizes each cluster into one original long-form blog post using `tencent/hy3-preview:free` via OpenRouter. Generates up to 3 posts per run. The model is completely free.

### Setup

1. Create a free account at https://openrouter.ai
2. Go to https://openrouter.ai/keys and create a new API key
3. Open the `.env` file in the project root (create it if it doesn't exist)
4. Add this as line 1:
```
OPENROUTER_API_KEY=your_key_here
```
5. Install dependencies:
```bash
npm install
```
6. Start the pipeline:
```bash
node server/cron.js
```

### How it works

1. **Fetching** — pulls the top 50 stories from the Hacker News API (free, no auth required)
2. **Filtering** — keeps only stories with score ≥ 100, a real URL, and at least one startup/tech keyword in the title
3. **Clustering** — groups related stories by shared topic keywords (AI, Fundraising, Product, Growth, etc.) into clusters of 3–5
4. **Synthesis** — sends each cluster's titles to `tencent/hy3-preview:free` which writes one original long-form post on the unified theme — not a summary of any single article
5. **Deduplication** — each cluster gets a `cluster_hash` (sorted story IDs joined) so the same cluster is never processed twice
6. **Storage** — posts saved to local SQLite at `/server/posts.db` with source titles and URLs stored as JSON arrays
7. **Serving** — Express API at `/api/posts` and `/api/posts/:id` serves posts to the blog page and individual post pages
8. **Scheduling** — runs automatically every day at 8am, generating up to 3 new posts per run

### Running manually

```bash
node server/cron.js
```

### Individual post pages

Each AI-generated post has its own page at `/blog/{id}` (numeric database ID). Clicking any post card on the blog listing navigates there. The page shows the full article, the source stories that inspired it, and a "What This Means For You" section.

### Clearing all generated posts

To remove all AI-generated posts and start fresh:
```bash
npm run blog:reset
```
This does not affect the two original hardcoded posts on the blog page.

### Adding or changing story filters

Open `server/pipeline.js` and adjust `TECH_KEYWORDS` (the keyword allowlist), `SKIP_PREFIXES` (HN thread types to skip), `MAX_POSTS_PER_RUN` (default 3), or the score threshold.

### Database

Stored at `server/posts.db`, gitignored. Columns: `id`, `title`, `content`, `cluster_hash` (dedup key), `source_titles` (JSON array), `source_urls` (JSON array), `hn_score` (average of cluster), `category`, `generated_date`.

### Troubleshooting

- `"OPENROUTER_API_KEY is not set"` — add your key to line 1 of the `.env` file in the project root
- `data.choices undefined` — your API key may be invalid or the model may be temporarily unavailable. Check https://openrouter.ai/keys
- Blog page empty — run `node server/cron.js` at least once to seed the database
- Posts not generating — confirm your key is valid and the `tencent/hy3-preview:free` model is still available at https://openrouter.ai/models

---

## 📝 Blog (MDX posts)

Add permanent posts by creating `.mdx` files in `src/content/blog/`:

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

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for setup instructions, coding standards, and the full workflow.

## 📞 Contact

- **Website**: [sepatuci.com](https://sepatuci.com)
- **Instagram**: [@sepatuci](https://instagram.com/sepatuci)
- **LinkedIn**: [Sigma Eta Pi @ UCI](https://www.linkedin.com/company/sepatuci/)

## 📄 License

This project is private and proprietary to Sigma Eta Pi @ UC Irvine.

---

Built with ❤️ by the Sigma Eta Pi @ UCI Tech Team