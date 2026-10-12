/**
 * One-time setup of the real Firebase project for the Founder's Education portal.
 *
 *   npm run portal:setup                       apply settings and create the admins
 *   npm run portal:setup -- --reset-credentials   also reset every admin's password and two-step
 *
 * It reads the same variables as the site (see .env.example) from .env.local:
 * FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and
 * PORTAL_ADMIN_EMAILS. It is safe to run more than once.
 *
 * What it does:
 *   1. Turns on two-step verification with authenticator apps (Duo Mobile).
 *   2. Turns off self sign-up and self-deletion, so only admins create accounts.
 *   3. Turns on email-enumeration protection and a minimum password length.
 *   4. Creates the admin accounts and prints a set-password link for each.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

const PASSWORD_MIN_LENGTH = 10;
const resetCredentials = process.argv.includes("--reset-credentials");
const out = (line = "") => process.stdout.write(`${line}\n`);

function fail(message) {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
  fail("Emulator settings are present. This script only configures a real Firebase project.");
}

const projectId = (process.env.FIREBASE_PROJECT_ID ?? "").trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL ?? "").trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");
const adminEmails = (process.env.PORTAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (!projectId || !clientEmail || !privateKey) {
  fail("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.local first.");
}
if (adminEmails.length === 0) {
  fail("Set PORTAL_ADMIN_EMAILS in .env.local to the admins' email addresses, separated by commas.");
}

const credential = cert({ projectId, clientEmail, privateKey });
const app = initializeApp({ projectId, credential });
const auth = getAuth(app);
const db = getFirestore(app);

async function enableSecuritySettings() {
  await auth.projectConfigManager().updateProjectConfig({
    multiFactorConfig: {
      state: "ENABLED",
      providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 1 } }],
    },
    emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
    passwordPolicyConfig: {
      enforcementState: "ENFORCE",
      forceUpgradeOnSignin: false,
      constraints: { minLength: PASSWORD_MIN_LENGTH },
    },
  });
  out("  Two-step verification (authenticator app), email privacy and password policy: on");

  // Self sign-up and self-deletion have no Admin SDK setting, so this goes to the REST API.
  const { access_token: accessToken } = await credential.getAccessToken();
  const mask = "client.permissions.disabledUserSignup,client.permissions.disabledUserDeletion";
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=${mask}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        client: { permissions: { disabledUserSignup: true, disabledUserDeletion: true } },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not turn off self sign-up (${response.status}): ${await response.text()}`);
  }
  out("  Self sign-up and self-deletion: off");
}

async function ensureAdmin(email) {
  let record;
  let existed = true;
  try {
    record = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    existed = false;
    record = await auth.createUser({ email, emailVerified: true });
  }

  // An account that already existed without the admin role was not created by
  // this script. Someone else may know its password, so it is reset before it
  // is trusted.
  const untrusted = existed && record.customClaims?.role !== "admin";
  if (untrusted || resetCredentials) {
    await auth.updateUser(record.uid, {
      password: randomBytes(32).toString("base64url"),
      emailVerified: true,
      disabled: false,
      multiFactor: { enrolledFactors: null },
    });
    await auth.revokeRefreshTokens(record.uid);
  }
  await auth.setCustomUserClaims(record.uid, { role: "admin" });

  const now = Timestamp.now();
  const profileRef = db.collection("users").doc(record.uid);
  const profile = await profileRef.get();
  if (profile.exists) {
    // A pledge who becomes an admin leaves their team, so pledges never see an admin as a teammate.
    await profileRef.update({ role: "admin", status: "active", email, teamId: null, updatedAt: now });
  } else {
    await profileRef.set({
      email,
      displayName: record.displayName ?? email.split("@")[0],
      role: "admin",
      status: "active",
      pledgeClass: null,
      teamId: null,
      onboardedAt: null,
      createdAt: now,
      createdBy: "setup-script",
      updatedAt: now,
      submitted: {},
      activity: { firstSeenAt: null, lastSeenAt: null, totalActiveSeconds: 0, sessionCount: 0, current: null },
    });
  }

  const needsPassword = !existed || untrusted || resetCredentials;
  const link = needsPassword ? await auth.generatePasswordResetLink(email) : null;
  return { email, link, state: !existed ? "created" : untrusted ? "reset (pre-existing account)" : resetCredentials ? "reset" : "unchanged" };
}

out(`\nConfiguring Firebase project "${projectId}"\n`);
try {
  await enableSecuritySettings();
} catch (error) {
  fail(
    `Could not apply the security settings: ${error?.message ?? error}\n\n` +
      "Check that the project has been upgraded to Firebase Authentication with Identity Platform\n" +
      "(Firebase console > Authentication > Settings) and that the service account can edit it.",
  );
}

out("\nAdmins");
for (const email of adminEmails) {
  const result = await ensureAdmin(email);
  out(`  ${result.email}: ${result.state}`);
  if (result.link) {
    out("    Set a password with this link. It expires in about an hour and works once:");
    out(`    ${result.link}`);
  }
}

out("\nDone. Remaining steps are listed in docs/portal-setup.md.\n");
