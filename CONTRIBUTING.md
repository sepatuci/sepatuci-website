# Contributing to SEP UCI Website

Thanks for your interest in contributing! This guide will walk you through everything you need to get started.

## Prerequisites

Make sure you have the following installed:

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/) (v1.x) &mdash; our package manager and runtime
- [Node.js](https://nodejs.org/) (v18 or later)

## Getting Started

1. **Fork the repository** on GitHub.

2. **Clone your fork** locally:

```bash
git clone https://github.com/<your-username>/sepatuci-website.git
cd sepatuci-website
```

3. **Install dependencies:**

```bash
bun install
```

4. **Start the development server:**

```bash
bun run dev
```

The site will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── app/             # Pages and routes (Next.js App Router)
├── components/      # React components
│   ├── ui/          # Reusable UI primitives (shadcn/ui)
│   └── ...          # Feature-specific component folders
├── content/         # Blog posts and other content (MDX)
├── assets/          # Images and static files
├── lib/             # Utility functions
└── types.ts         # Shared TypeScript types
```

## Making Changes

### 1. Create a branch

Always work on a new branch, not directly on `main`:

```bash
git checkout -b feat/your-feature-name
```

Use a descriptive branch name. Prefix it with `feat/`, `fix/`, `docs/`, etc.

### 2. Write your code

A few things to keep in mind:

- **TypeScript** &mdash; all code should be written in TypeScript. The project uses strict mode.
- **Tailwind CSS** &mdash; use Tailwind utility classes for styling. Avoid writing custom CSS unless absolutely necessary.
- **Components** &mdash; reusable UI elements live in `src/components/ui/`. Page-specific components go in their respective folders (e.g., `LandingComponents/`).
- **Images** &mdash; place images in `src/assets/` and import them. Use Next.js `<Image>` for optimization.

### 3. Check your work

Before committing, make sure the project builds and lints cleanly:

```bash
bun run lint
bun run build
```

Fix any errors or warnings before proceeding.

### 4. Commit your changes

We use [Conventional Commits](https://www.conventionalcommits.org/). Every commit message should follow this format:

```
type: short description
```

| Type       | When to use                          |
| ---------- | ------------------------------------ |
| `feat`     | Adding a new feature                 |
| `fix`      | Fixing a bug                         |
| `docs`     | Documentation changes                |
| `style`    | Formatting, missing semicolons, etc. |
| `refactor` | Code changes that aren't fixes/feats |
| `perf`     | Performance improvements             |
| `chore`    | Build process, dependency updates    |

Examples:

```bash
git commit -m "feat: add alumni spotlight section"
git commit -m "fix: resolve navbar overflow on mobile"
git commit -m "docs: update rush timeline"
```

### 5. Push and open a Pull Request

```bash
git push origin feat/your-feature-name
```

Then open a Pull Request on GitHub against the `main` branch. In your PR description:

- Summarize what you changed and why
- Include screenshots if you changed anything visual
- Link any related issues

## Adding a Blog Post

Blog posts are written in MDX and live in `src/content/blog/`. To add a new post:

1. Create a new folder under `src/content/blog/` with a URL-friendly name.
2. Add a `page.mdx` file with your content.
3. Include frontmatter metadata at the top (title, date, description, etc.).
4. Run the dev server and navigate to `/blog/your-post-name` to preview.

## Tech Stack Reference

| Tool              | Purpose                    |
| ----------------- | -------------------------- |
| Next.js 16        | React framework            |
| TypeScript        | Type safety                |
| Tailwind CSS      | Utility-first styling      |
| shadcn/ui         | UI component library       |
| Framer Motion     | Animations                 |
| MDX               | Blog content               |
| Vercel            | Hosting and deployment     |
| Bun               | Package manager and runtime|

## Getting Help

If you're stuck or have questions, open an issue on GitHub or reach out to a maintainer. We're happy to help!
