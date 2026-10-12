# Founder's Education portal: setup and operations

The portal lives at `/login` and `/portal`. Pledges turn in their Founder's Education deliverables
there. Admins manage accounts and teams, build the forms and read the responses.

Three parts: try it locally, connect a real Firebase project, run it day to day.

## How it is put together

- **Sign-in**: UCI email and password. No sign-up, and no "Forgot password?" in the portal: admins
  create every account and replace every lost password. Firebase itself will still email a reset
  link to an account's address if someone asks it to directly. The portal only ever accepts an
  account on the UCI address it was issued with, so that link is of use only to whoever holds that
  mailbox.
- **Data**: Firestore, reached only through the server routes under `/api/portal`. Each request is
  checked for sign-in and role before anything is touched. `firestore.rules` denies
  all direct access.
- **Admins**: the addresses in `PORTAL_ADMIN_EMAILS` that the setup script also gave the admin
  role. Both are required. Admin accounts cannot be changed from inside the portal.
- **Sessions**: one browser tab. A tab signs itself out after 30 idle minutes. Every sign-in ends
  12 hours after it started, enforced by the server. The Sign out button ends it on every device.

There is no second sign-in step, so an account is as safe as its password. The portal enforces the
password rules, and admins should use a long one that they use nowhere else.

### Who can see what

- A pledge sees only their own deliverables, drafts, responses, notices and account.
- A pledge on a team also sees the team's name and their teammates' names. Nothing else.
- An active sees the pledges' work, view only: names, teams, progress, released deliverables and
  submitted responses. Not punishments, time on site, emails, account details, or anything not yet
  released. An active cannot change anything.
- Admins see everything. Every change an admin makes is recorded under Activity.

Actives read responses in full, so anything a pledge types into an answer is visible to them.

### Light and dark mode

The sign-in pages and the portal follow the device by default. The button in the header switches,
and Account has the full choice. It is saved on that device only. The public site is unchanged.

## Try it locally

Needs the Firebase CLI (`npm install -g firebase-tools`) and Java 21 or newer. No Firebase project.

```bash
npm install
npm run portal:dev
```

This starts the Firebase emulators with demo pledges, a demo team, deliverables and responses, and
serves the site at `http://localhost:3000/login`. The terminal prints the demo accounts. Everything
is rebuilt on each start.

To see a brand-new account from the start, sign in as `casey.tran@uci.edu` with the temporary
password `FNDR-EDUC-2626`: you are asked to choose a password, then shown the welcome tour.
`theo.park@uci.edu` with `SEPA-CTVE-2626` does the same for an active. Use `jordan.patel@uci.edu`
for the tour alone, or `priya.shah@uci.edu` for the actives' view-only area.

To sign in to the demo as yourself, put `PORTAL_DEMO_ADMINS=you@uci.edu` in `.env.local` (git
ignores it) and restart. You become an admin with the demo password.

One difference from the real thing: no email is sent. Password links are printed in the terminal.
`/login?preview=password` shows the choose-a-password step without signing in.

This mode cannot run in production: the server refuses it on a production build or on Vercel.

## Connect a real Firebase project

Once, in order.

1. **Create the project** at <https://console.firebase.google.com>.
2. **Authentication**: Build > Authentication > Get started. Enable **Email/Password**. Leave
   "Email link" off.
3. **Identity Platform**: Authentication > Sign-in method > Advanced > **Upgrade to enable**. Free
   at this size, and required for the password rules the setup script switches on.
4. **Firestore**: Build > Firestore Database > Create database. Production mode, a US region.
5. **Web app**: Project settings > General > Your apps > add a Web app. Copy `apiKey`,
   `authDomain`, `projectId` and `appId` into the four `NEXT_PUBLIC_FIREBASE_*` variables.
6. **Service account**: Project settings > Service accounts > Generate new private key. Copy
   `project_id`, `client_email` and `private_key` into `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, then delete the file. The key can read and
   change everything. It never goes in this repository, which is public.
7. **Admins**: set `PORTAL_ADMIN_EMAILS` to the admins' UCI emails, comma-separated.
8. **Run the setup script** with all of the above in `.env.local` (copy `.env.example`):

   ```bash
   npm run portal:setup
   ```

   It turns off self sign-up, keeps multi-factor sign-in off and removes any authenticator left on
   an account, sets the password rules, creates the admin accounts and prints a one-time password
   link for each. Links last about an hour.
9. **Lock the database**:

   ```bash
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```
10. **Authorized domains**: Authentication > Settings > Authorized domains. Add the production
    domain only.
11. **Email template**: Authentication > Templates > Password reset > edit.
    - Action URL: `https://YOUR_DOMAIN/login/reset`.
    - Sender name: for example "SEP Founder's Education".
    - Wording: this email is the welcome for a new pledge who starts from an emailed link.
      Firebase's default only fits the second. Suggested subject: "Your Founder's Education portal
      password". Suggested message: "Use this link to choose a password for the Sigma Eta Pi
      Founder's Education portal. It works once and expires in about an hour. If you weren't
      expecting this, ignore it."
12. **Vercel variables**: Project > Settings > Environment Variables. Add all eight and tick
    **Production only**. Paste `FIREBASE_PRIVATE_KEY` exactly as it appears in the JSON file,
    including the `\n` sequences.

    Why Production only: the repository is public, and a preview build runs whatever code is on a
    branch or pull request. With the key in previews, unreviewed code could read every pledge's
    data. Without it, a preview shows "The portal isn't open yet". Keep Vercel's protection for
    pull requests from forks switched on.
13. **Blaze plan and a budget alert. Required before real pledges use the portal.** Firebase
    console > Usage and billing. Blaze has the same free allowance, so a normal month still costs
    nothing. What it removes is the daily cut-off: on the free plan, one deadline night or one
    scripted account can use up the day's allowance in about an hour and take the portal down for
    everyone until midnight Pacific. Set the alert at a few dollars.
14. **Restrict the web API key** (recommended): Google Cloud console > APIs & Services >
    Credentials > the Browser key > Website restrictions. Allow only your domain.
15. **First sign-in**: each admin opens their link, chooses a password and signs in at `/login`.

### Check once after the first deploy

None of this could be verified without a real project.

- Sign in as an admin and open Pledges. If the portal says it is
  unavailable, read the function logs in Vercel. Usual causes: a mistyped private key or a missing
  variable.
- Vercel installs with `npm ci` (set in `vercel.json`) and runs functions on Node. Keep both: a
  second install with a different tool removes files the portal's server code needs, and the
  deployment then fails after a successful build.
- Create a test pledge with an address you control. Confirm the email arrives; UCI's filters may
  send it to spam. If so, use "Get password link" on the pledge's page.
- Go through a first visit as that pledge: password, sign-in, welcome tour, deliverables.

## Running it day to day

The Guide page inside the portal covers this for admins, with a checklist of first steps.

**Add a pledge.** Pledges > Add pledge, with their name and UCI email. Choose how they start:

- *Email a link*: they are emailed a link to choose a password, and the dialog shows the same
  link. Links last about an hour. An expired one is replaced from their page.
- *Temporary password*: the dialog shows a password such as `K7QM-2XRT-9BHD` for you to pass on.
  It is shown once and works for 3 days. Their first sign-in makes them replace it, and nothing
  else in the portal opens until they do. If it runs out, give them a new one from their page.

**Add a whole class.** Pledges > Add several. Paste one person per line, a name and a UCI email
separated by a comma or a tab; columns copied from a spreadsheet work, first name before last. Lines with anything extra,
such as a phone number or a second email, are refused. Set a class for the whole list and choose
how they start. The list is checked before anything is created, then accounts are made one at a
time with a result for each. Firebase sends at most 150 password emails a day, so with emailed
links add pledges and actives on different days. With temporary passwords, copy the list before
closing: they cannot be shown again.

**A first visit.** It happens once per account: choose a password, then a short welcome. A
pledge's welcome covers SEP, Founder's Education and how deliverables work. An active's covers what they can and cannot see. Both stay available under
Guide.

**Locked out or lost the password.** There is no "Forgot password?" anywhere in the portal. The
sign-in page and the Account page tell people to contact an active or an admin. An active passes
the request on; an admin acts on it from the person's page:

- *Temporary password*: a new one to pass on. It signs them out everywhere, and they choose their
  own at the next sign-in. Give it to the person face to face, or send it to their own `@uci.edu`
  address. Never send it to whoever asked: a message claiming to be a pledge on a new number is
  the easy way into someone else's account.
- *Get password link*: a one-time link to send them. It also cancels a temporary password that has
  not been used yet.

A temporary password that runs out after its 3 days is replaced the same way. Resetting a password
from the Firebase console works too, but it does not clear a temporary password still outstanding
in the portal, so use one of the two buttons above for anyone who has one.

**Actives.** Actives > Add active, or Add several. They start the same way as a pledge, then get a
view-only area. The same page disables, removes and replaces passwords. A pledge
who becomes an active needs a new account: an email can only have one, so the pledge account must
be removed first, which deletes their responses.

**Teams.**

- Everyone starts solo. Create a team on the Teams page, name it and tick its members.
- One team per pledge. Ticking someone from another team moves them.
- Saving applies only the ticks you changed, so two admins editing at once do not undo each other.
- A pledge's team can also be set from their own page.
- Teams group the Pledges view and each deliverable's responses. The spreadsheet has a Team column.
- Deliverables are still turned in by each pledge. Deleting a team keeps its members and their work.

**Disable or remove.** Disable signs the pledge out at once and blocks sign-in, keeping their work.
Remove deletes the account and everything attached to it, for good.

**Punishments.** Add one from the pledge's page. It shows as a notice on their dashboard until you
resolve it. Pledges with none see nothing.

**Create a deliverable.** Deliverables > New deliverable. Write the questions, set the schedule in
Settings, then Publish.

- *Visible from*: when it appears on dashboards as coming up.
- *Opens*: when pledges can start. Before that they see the title and dates, never the questions.
- *Due*: the deadline, to the minute. 11:59 PM includes all of 11:59.
- *Accept late responses*: on, later ones are accepted and marked late. Off, it closes at the
  deadline.
- *Unlock order*: locked for each pledge until they turn in another deliverable.

**Edit a published deliverable.**

- Changes reach pledges who have not turned it in. Responses already in keep the questions they
  answered.
- A pledge who has it open when the questions change is asked to check their answers first. Nothing
  they typed is lost. Changing only the schedule does not interrupt anyone.
- Once there are responses, a question cannot change type, and the deliverable can be archived but
  not deleted.

**Let a pledge redo one.** Open their response and choose Delete and reopen.

**An admin is locked out.** From a machine with `.env.local`:
`npm run portal:setup -- --reset-credentials`. It resets every admin's password and prints new
links. The Firebase console can also send one admin a reset email: Authentication > Users > the
menu on their row > Reset password.

**Change the admins.** Update `PORTAL_ADMIN_EMAILS` in `.env.local` and in Vercel, redeploy, then
run `npm run portal:setup`. An address taken off the list loses access as soon as the deploy is
live.

## Limits worth knowing

- **Database allowance.** The free plan allows 50,000 reads and 20,000 writes a day, then stops:
  everyone sees errors until midnight Pacific. A normal day uses a small part of it. A deadline
  night, with thirty pledges writing at once, can use most of it in under an hour. This is why
  step 13 is required.
- **Request ceilings.** 120 requests a minute and 1,200 an hour per account, lower for requests
  that change data. Turning a deliverable in is never held back. The count is per server instance,
  so it slows a runaway script and guarantees nothing.
- **Finding a misbehaving account.** A ceiling being hit logs `[Portal] Rate limit reached` with
  the account's id. Search the function logs in Vercel for it. The id is the last part of that
  pledge's page address. Disable the account there, or in the Firebase console if the portal is
  down.
- **Email.** Firebase's built-in mailer sends at most 150 password emails a day.
- **Time on site.** Counts time with a portal tab open and in view, as the pledge's browser
  reports it. A visit is one session until the pledge has been away five minutes. It measures use;
  it is not a timesheet.
- **Uploads.** None. Pledges paste an `https://` link to a Google Doc or Drive file.
- **Answer length.** 500 characters for a short answer, 5,000 for a paragraph, about 800 words. The
  boxes stop at the limit.

## Tests

```bash
npm run typecheck     # types
npm test              # unit tests, no setup
npm run test:portal   # API tests against the emulators (Firebase CLI and Java 21+)
```
