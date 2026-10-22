# Putting Plumbline online

One-time setup, about an hour. Do the steps in order. After this, every change Claude makes goes live on its own when it's merged.

## 1. Domain (Namecheap)
Buy **plumblineassessment.com**. You can also buy **plumblineassessment.org** and forward it to the .com.

## 2. Database (Supabase)
1. Go to supabase.com, select **New project**, and name it **plumbline**. Pick the US East region, and save the database password in your password manager.
2. Under **Billing**, choose the **Pro plan** ($25 a month). The free plan pauses the database after a week without use and keeps no backups. Pro never pauses and keeps daily backups.
3. Open **SQL Editor**, select **New query**, paste everything in `supabase/setup.sql`, and select **Run**.
4. Open **Project Settings**, then **API**. Send Claude the **Project URL** and the **anon public** key. Both are meant to be public, because the website uses them in every visitor's browser. Never send the `service_role` key.
5. Open **Authentication**, then **URL Configuration**:
   - Set **Site URL** to `https://plumblineassessment.com`.
   - Under **Redirect URLs**, add `https://plumblineassessment.com/**`.

## 3. Email (Resend)
Plumbline sends invites, reminders, team invites and "someone finished" notes.
1. Go to resend.com and create a free account. The free plan sends 3,000 emails a month, at most 100 a day. Move to the $20 plan (50,000 a month) once several networks are inviting people.
2. Select **Domains**, then **Add domain**, and enter `plumblineassessment.com`. Resend shows 3 or 4 DNS records. Add each one in Namecheap under **Advanced DNS**, then select **Verify** in Resend.
3. Select **API Keys**, then **Create**, and keep the key for step 4.
4. In Supabase, open **Authentication**, then **Emails**, then **SMTP Settings**, and turn on custom SMTP so sign-in emails go through Resend too:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - Sender: `hello@plumblineassessment.com`, name "Plumbline"

## 4. Code (GitHub)
1. Claude pushes the code to your **plumbline** repo.
2. In the repo, open **Settings**, then **Pages**, and set **Source** to **GitHub Actions**.
   - GitHub Pages on a free account requires a public repo. Everything in this repo already ships to every visitor's browser, so making it public exposes nothing new.
   - To keep the repo private, tell Claude and it will host on Netlify instead.
3. Under **Custom domain**, enter `plumblineassessment.com`, select **Save**, and check **Enforce HTTPS** once it's available.
4. Open **Settings**, then **Secrets and variables**, then **Actions**, and add these. They let every update reach the database and email function automatically:

| Kind | Name | Where to find it |
|---|---|---|
| Secret | `SUPABASE_DB_URL` | Supabase: **Connect**, then **Session pooler** connection string, with your database password filled in |
| Secret | `SUPABASE_ACCESS_TOKEN` | supabase.com: **Account**, then **Access Tokens**, then **Generate** |
| Secret | `RESEND_API_KEY` | The key from step 3 |
| Variable | `SUPABASE_PROJECT_REF` | The letters in your Project URL before `.supabase.co` |
| Variable | `SITE_URL` | `https://plumblineassessment.com` |

## 5. Point the domain (Namecheap)
In **Advanced DNS** for plumblineassessment.com, delete the parking records and add these (keep Resend's records):

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | YOUR-GITHUB-USERNAME.github.io. |

DNS can take up to an hour to update.

## 6. Make yourself the platform admin
After you've signed in on the site once, run this in the Supabase SQL Editor. It shows you platform-wide counts, never anyone's answers.
```
insert into public.platform_admins select id from auth.users where email = 'parker@parkermanuel.com';
```

## 7. Try it
1. Go to plumblineassessment.com, select **Network leaders**, sign in, and create your network.
2. Under **Settings & team**, invite Jess as an assessor.
3. Select **New assessment** and set one up for the two of you with your emails.
4. Open the invite email on your phone, answer a few questions, then open the same link on your laptop. It should pick up where you left off.
5. Watch the progress bar move on your dashboard.

## Who sees what
- **A network's team (owners, admins, assessors):** every assessment in their network, including the spouse's private note, the safety answers and references' confidential comments.
- **Owners and admins:** can also change settings, manage the team and delete assessments.
- **Planter and spouse:** their own answers. After the team selects **Release their reports**, each sees their own report. From their spouse they see only summaries (the average for each wiring dimension and each couple area), never the other's individual answers.
- **References:** only their own form.
- **Other networks:** nothing. The database blocks it at the row level.
- **You, as platform admin:** counts only.

## What it costs at scale
| Item | Cost | What it covers |
|---|---|---|
| Supabase Pro | $25 a month | 8 GB of storage (about 40,000 couples), backups, 500 people watching dashboards live at once |
| Resend | Free up to 3,000 emails a month (100 a day), then $20 for 50,000 | About 10 emails per couple: 300 couples a month free, 5,000 on the $20 plan |
| GitHub Pages | Free | The website |
| Domain | About $12 a year | plumblineassessment.com |

The 40,000-couple figure comes from about 30 KB of answers per person × 6 people per couple ≈ 180 KB per couple, out of 8 GB.
