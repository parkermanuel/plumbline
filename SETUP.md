# Putting Plumbline online

One-time setup, roughly 30 minutes. Do the steps in order.

## 1. Domain (Namecheap)
Buy **plumblineassessment.com**. You can also buy **plumblineassessment.org** and forward it to the .com.

## 2. Database (Supabase)
1. Go to supabase.com, select **New project**, and name it **plumbline**. Pick the US East region, and save the database password in your password manager.
2. Open **SQL Editor**, select **New query**, paste everything in `supabase/setup.sql`, and select **Run**. It should say "Success".
3. Open **Project Settings**, then **API**. Copy the **Project URL** and the **anon public** key, and send both to Claude. They're meant to be public, because the website uses them in every visitor's browser. Never send the `service_role` key.
4. Open **Authentication**, then **URL Configuration**:
   - Set **Site URL** to `https://plumblineassessment.com`.
   - Under **Redirect URLs**, add `https://plumblineassessment.com/**`.
5. Open **Authentication**, then **Emails**, then **SMTP Settings**, and turn on custom SMTP. Supabase's built-in email only sends a few sign-in emails an hour.
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: your Workspace address
   - Password: a Google **app password** (create one at myaccount.google.com, then App passwords)
   - Sender: `hello@plumblineassessment.com`

## 3. Code (GitHub)
1. Claude pushes the code to your **plumbline** repo.
2. In the repo, open **Settings**, then **Pages**, and set **Source** to **GitHub Actions**.
   - GitHub Pages on a free account requires a public repo. Everything in this repo already ships to every visitor's browser, so making it public exposes nothing new.
   - If you'd rather keep it private, tell Claude and it will use Netlify instead.
3. Under **Custom domain**, enter `plumblineassessment.com`, select **Save**, and check **Enforce HTTPS** once it's available.

## 4. Point the domain (Namecheap)
Open **Domain List**, then **Manage** next to plumblineassessment.com, then **Advanced DNS**. Delete the parking records and add these:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | YOUR-GITHUB-USERNAME.github.io. |

DNS can take up to an hour to update.

## 5. Try it
1. Go to plumblineassessment.com, select **Network leaders**, and sign in with your email.
2. Select **New assessment** and set one up for yourself and Jess.
3. Open the planter link on your phone, answer a few questions, then open the same link on your laptop. It should pick up where you left off.
4. Watch the progress bar move on your dashboard.

## Who sees what
- **Network leader:** everything for their own assessments only, including the spouse's private note, the safety answers and references' confidential comments.
- **Planter and spouse:** their own answers while they take it. After the leader selects **Release their reports**, each sees their own personal report. From their spouse they see only summaries (the average for each wiring dimension and each couple area). They never see the other's individual answers.
- **References:** only their own form.
- **Other network leaders:** nothing. The database blocks it at the row level.
