/**
 * Runs the site against the local Firebase emulators with demo data, so the
 * whole portal works with no Firebase project and no credentials.
 *
 * Start it with `npm run portal:dev`, which wraps this script in
 * `firebase emulators:exec`. That command is what provides the emulator
 * addresses; this script never works against a real project.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { DEMO_ADMINS, DEMO_PASSWORD, seed } from "./seed-emulator.mjs";

/**
 * Your own address as a demo admin, so you can sign in locally as yourself.
 * Set PORTAL_DEMO_ADMINS (comma-separated) in the shell or in .env.local,
 * which git ignores, so real addresses stay out of this public repository.
 * Only that one line of .env.local is read here.
 */
function ownDemoAdmins() {
  let raw = process.env.PORTAL_DEMO_ADMINS ?? "";
  if (!raw && existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("PORTAL_DEMO_ADMINS="));
    raw = line ? line.slice(line.indexOf("=") + 1) : "";
  }
  return [
    ...new Set(
      raw
        .replace(/["']/g, "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !DEMO_ADMINS.includes(email)),
    ),
  ];
}

const port = process.env.PORT ?? "3000";
const ownAdmins = ownDemoAdmins();
const seeded = await seed({ extraAdmins: ownAdmins, firstRun: true });

const lines = [
  "",
  "  Founder's Education portal: local demo",
  `  Site        http://localhost:${port}/login`,
  "  Emulator UI http://127.0.0.1:4000",
  "",
  `  Password for every demo account: ${DEMO_PASSWORD}`,
  `  Admin   ${seeded.admins[0]}`,
  ...ownAdmins.map((email) => `  Admin   ${email}  (yours, from PORTAL_DEMO_ADMINS)`),
  ...seeded.actives.map((email) => `  Active  ${email}  (read-only view)`),
  ...seeded.pledges.map((email) => `  Pledge  ${email}`),
  "",
  "  Two brand-new accounts, to see the whole first visit:",
  `  Pledge  ${seeded.firstRun.email}  temporary password ${seeded.firstRun.temporaryPassword}`,
  `  Active  ${seeded.firstRunActive.email}  temporary password ${seeded.firstRunActive.temporaryPassword}`,
  "  Signing in asks them to choose a password, then shows their welcome.",
  "  jordan.patel has a password already and still has the tour to do.",
  "",
  "  Password-reset links are printed in this terminal instead of being emailed.",
  "",
];
process.stdout.write(`${lines.join("\n")}\n`);

const child = spawn("npx", ["next", "dev", "--port", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORTAL_ADMIN_EMAILS: [...DEMO_ADMINS, ...ownAdmins].join(","),
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT ?? "demo-sep-portal",
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "",
  },
});

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
