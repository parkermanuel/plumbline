# Designing a Trustworthy Church Planter + Spouse Assessment (Self-Report + 360)

Research notes for a free web tool. The planter and spouse each take their own assessment without talking it over, observers add 360 ratings, and a network leader gets a graded report with strengths, growth areas, concerns and interview talking points. Every item will be written from scratch. Everything below is paraphrased, with sources listed at the bottom.

Note on certainty: points marked [verified] were confirmed on a source page during this research. Points marked [established practice] are standard psychometric guidance that the listed sources and the wider literature support, but no single page was fetched to confirm the exact figure. Treat the numbers as starting rules, not laws.

---

## 1. Psychometric best practice for short self-report scales

### Item writing
- One idea per item. Avoid "double-barreled" items such as "I am organized and disciplined."
- Use plain language at about an 8th-grade reading level, and say something concrete and observable ("In the last month I..." beats "I am a visionary").
- Anchor items in behavior and frequency over the past 3 to 12 months. This cuts down self-flattering trait claims.
- Avoid absolutes ("always", "never"), negations stacked on negations, and church jargon that means different things in different traditions.
- Write each item so a reasonable person could honestly answer at either end of the scale. If everyone will agree, the item tells you nothing.
- Write 1.5 to 2 times the items you need, then pilot and cut the weakest.
- Map every item to exactly one scale. Keep a blueprint (scale → items → which competency it serves, such as Ridley's 13 planter characteristics).

### Format choice: Likert vs forced choice vs SJT
| Format | Strengths | Weaknesses | Best use here |
|---|---|---|---|
| Likert (5-point agree, or frequency) | Easy, fast, normative (scores can be compared across people), simple to score | Easiest to fake when stakes feel high; people inflate | Most scales, the spouse assessment, the 360 |
| Forced choice (pick the most/least like me from equally attractive statements) | Harder to fake. Meta-analytic work (Cao & Drasgow 2019; Martínez et al. 2021) finds it reduces, but does not remove, faking | Fully ipsative scoring only ranks a person against themselves, so you can't compare people. Harder to build, since statements must be matched for desirability | A short "ministry strengths/preferences" block, scored quasi-ipsatively or with IRT-style scoring [established practice] |
| Situational judgment test (realistic scenario, rate or rank responses) | Measures judgment in context, feels relevant, resists simple self-promotion, valued in selection research | Needs expert-keyed answers and is time-consuming to write. Reliability is often low because scenarios measure several things at once | 6 to 10 planting scenarios (conflict with a launch-team member, money shortfall, spouse burnout, a moral failure disclosure), keyed by a panel of experienced planters/assessors |

Recommendation: mostly Likert, plus a short forced-choice block and a short SJT block. Using several methods lets the report check whether different formats agree.

### Reverse-keyed items
- Include about 20 to 30% reverse-keyed items per scale ("I tend to put off hard conversations"). This catches people who agree with everything and those who answer without reading.
- Write them as positive statements of the opposite behavior. Do not just add "not", because negated items confuse people and hurt the scale's structure.
- Score: reversed = (max + min) − raw.

### Social desirability / impression management ("validity") scales
- How PREPARE-ENRICH does it conceptually: it includes an **Idealistic Distortion** scale, a short set of items describing the relationship in unrealistically perfect terms. Their published reliability for it is high (alpha around .80 to .88, [verified] in their Scientific Foundation document). High scorers are seen as answering idealistically, and their other scale scores are interpreted, or statistically adjusted downward, with that in mind. We will not copy their items. We only borrow the concept.
- Build our own "Candor" scale of 6 to 8 items that describe near-universal small faults or impossible virtues:
  - Impossible virtue: "I have never felt irritated with someone on my team." (agreeing raises the flag)
  - Universal fault: "There are times I compare my church to other churches." (disagreeing raises the flag)
- Use it to flag, not to adjust: if Candor is high, the report says "answers may be more idealized than typical; lean on 360 and interview." Do not secretly alter scores.
- Ask a separate candor question about the marriage in both spouse forms.

### Consistency checks (careless or inconsistent responding)
Research comparing detection methods (Schroeders et al.-style comparison, Behavior Research Methods 2024, [verified]) found:
- The best performers were within-person consistency indices: repeated split-half personal reliability, plus "psychometric synonyms/antonyms" (pairs of near-identical or opposite items that should agree). These need at least 3 eligible item pairs.
- Sample-based indices (Mahalanobis distance, person-total correlation) also did well, but need a reference sample of careful responders.
- Response time was only mediocre when based on raw average time per item. Longstring (same answer many times in a row) performed poorly as a stand-alone check.
- For bogus items ("I have visited every country on earth"), three items did only moderately; the authors suggest about 8. Instructed items ("select 'disagree' here") performed worse than bogus items.
- Use several indices together.

Practical rules for our tool:
- Build 4 to 6 synonym/antonym pairs spread across the form, and flag if more than about a third of them disagree by 2 or more scale points.
- Add 2 or 3 gentle bogus items in a pastoral tone, not mocking.
- Response time: log time per page. Flag pages averaging under about 2 seconds per item. This is a common heuristic in the careless-responding literature [established practice], and the research above warns that raw time alone is a weak signal. Treat it as a soft flag that combines with others.
- Flag long runs of identical answers only as supporting evidence.
- Outcome: a "Response quality: Good / Some concerns / Retake recommended" line in the report, never an accusation.

### Minimum items per scale for reliability
- Cronbach's alpha rises with item count. With 2-item scales, alpha is a poor estimate, so for two items use the Spearman-Brown coefficient (Eisinga et al. 2013).
- Rule of thumb: 4 to 6 items per scale for a scale you report as a score, and at least 3 as an absolute floor. Target alpha ≥ .70 for feedback and development use. Use higher (≥ .80) if a scale drives a "concern" flag on its own [established practice; see the Rammstedt short-scale literature in sources].
- Short scales can be valid if their items cover the full breadth of the concept (Rammstedt & Beierlein, "Can't we make it any shorter?").
- Practical blueprint: about 12 to 15 scales × 5 items, plus validity items, comes to roughly 80 to 100 items, or about 20 to 25 minutes for the planter. The spouse form should be shorter, about 50 to 60 items.
- Once you have about 100 or more completions, compute alpha and item-total correlations, and replace items whose item-total r is below .30.

### Norming without a big sample
- Don't claim percentiles ("top 15% of planters") until you have hundreds of cases from one comparable group. Use **criterion-referenced** cut scores instead.
- Expert standard-setting methods:
  - **Modified Angoff**: a panel of about 5 to 10 experienced assessors and planters estimates, for each item, how a "minimally ready" planter would respond. The sum of those estimates sets the cut. This is widely used in licensure, and studies show it works with small groups when judges are trained and discuss.
  - **Bookmark / contrasting groups**: once some data exist, compare the score distributions of planters the network judges "thriving" versus "struggling" and set the cut where they separate.
- Document the panel, the method and the date. Per the user's credibility rule, the report should show how every band was set.
- Revisit cuts after every 50 to 100 completions.

### Presenting scores honestly
- Use **bands, not decimals**. For example: Strength / Solid / Developing / Growth Area, with a separate "Concern" flag for specific risk items.
- Explain that every score has error. With alpha about .75 on a 5-item scale, the standard error is large enough that a small difference between two scales means nothing. Don't rank scales that sit within one band of each other.
- Show the work: list each scale's items, how they were scored, the cut points, who set them and why.
- Pair every number with words and a next step ("Explore in interview: ...").
- Never produce an overall single "pass/fail" or "planter score". Use a profile.

---

## 2. 360 / observer ratings

### How many raters
- CCL (Center for Creative Leadership) sets minimum rater numbers per category to protect anonymity, and recommends inviting more than the minimum (exact numbers vary by instrument, [verified]).
- Common practice: about 3 or more raters per category to show category averages, and invite about 5 per category since not everyone responds. A boss or supervisor category can be shown with 1 rater because anonymity isn't expected there [established practice].
- Total: about 8 to 12 observers gives reasonably stable averages.

### Rater categories for planters
1. Spouse (rates the planter on ministry items; this is separate from the spouse's own self-assessment)
2. Supervisor / sending pastor / network coach
3. Ministry peers / co-laborers
4. People they have led (volunteers, small-group members, staff)
5. Outside the church (a neighbor, coworker or non-Christian friend). This is useful for the "reaching unchurched people" and "community" competencies.

### Self vs observer gap analysis
- Compare the self score with the average of others, by scale.
- **Blind spot**: self is noticeably higher than others (overrating). Research consistently ties overrating to poorer leadership outcomes.
- **Hidden strength**: others rate noticeably higher than self (underrating).
- **Agreed strength / agreed growth area**: both are high or both are low.
- Set the "noticeably" threshold as a band difference (self and others in different bands), or about 0.5 or more points on a 5-point scale when averaged over several raters [established practice]. Don't treat smaller gaps as meaningful.
- Also show **rater disagreement** (spread within a category). If peers vary widely, say so instead of averaging it away.
- Observers rate only behaviors they could have seen. Include a "Not observed" option on every item.

---

## 3. Couples assessment design

### Measuring agreement between partners
- PREPARE-ENRICH's approach (conceptually): each partner answers independently, and the report focuses on **Positive Couple Agreement**: items where both partners give a healthy answer. Items where they disagree, or both give a concerning answer, become discussion topics [verified that PCA scores underpin their couple typology; exact formula is proprietary and not used here].
- Our own version:
  - Write paired items that both spouses answer about the same thing ("We have agreed how many evenings per week ministry can take").
  - Classify each item:
    - **Agreed strength**: both answer positively.
    - **Gap**: they answer differently, by 2 or more points or on opposite sides of neutral.
    - **Shared concern**: both answer negatively.
  - **Couple Agreement Score** for each area = % of items that are agreed strengths. Show it in bands, not to the percent.
- Content areas: shared sense of calling to plant; vision for the city; finances and money stress (bivocational, fundraising, salary, debt); roles (who does what at home and at church, what the spouse's ministry role will and won't be); expectations (hours, Sabbath, hosting in the home, kids' involvement); conflict and communication; support systems; health and stress; family of origin.
- Include "perspective-taking" items: "How would your spouse answer: they feel called to plant." Comparing the guess with the spouse's real answer shows how well each knows the other's heart.

### Taking it separately
- Use separate logins or links, and tell each partner "please don't discuss your answers until you have both finished; the differences are useful."
- Neither spouse sees the other's raw answers before the debrief.

### Surfacing gaps without causing harm
- Name gaps as "conversation starters", not failures. Every couple has some.
- Show **areas**, not individual raw answers, in anything the couple might see together. Keep item-level answers in the leader report for interview prep.
- Give the spouse a private, safe channel: 2 or 3 items that go only to the assessor ("Is there anything you'd want the assessor to know that you couldn't say in front of your spouse?").
- Include a safety screen (fear, control, abuse). If it is flagged, the result **must never be shown in any joint report** and routes to a trained person following a safety protocol. Joint discussion of abuse can increase risk.
- Debrief in person with a trained leader, not by sending a PDF.
- The spouse is assessed for partnership and readiness, not "hired". Make clear the spouse is not being evaluated as a co-pastor unless that is the plan (Ridley characteristic #5: spousal cooperation).

---

## 4. Behavioral interview design

### Why structured interviews
- Meta-analyses (Schmidt & Hunter 1998; later updates such as Sackett et al. 2022; Levashina et al. 2014 review) show structured interviews predict job performance much better than unstructured ones, and are among the best single predictors.
- What "structure" means: same core questions for every candidate, questions based on the competency model, follow-up probes, rating each answer against anchors, and more than one interviewer whose ratings are combined.

### STAR / behavioral event interviewing
- Ask about past behavior: "Tell me about a time you..." People's past behavior in similar situations is the best guide.
- Probe for **S**ituation, **T**ask, **A**ction (what *you* did, not "we") and **R**esult (what happened, what you learned).
- Include some future-oriented situational questions ("What would you do if...") tied to the SJT scenarios.

### How the report generates talking points
- For each **growth area, concern, blind spot or couple gap**, the report produces 1 or 2 behavioral questions plus probes. Example:
  - Blind spot on "developing leaders": "Tell me about the last person you handed real responsibility to. What did you hand off, and what happened?" Probes: "What did you do when they did it differently than you would?"
- For each **strength**, one confirming question ("Give me an example that shows this").
- Couple gap prompts are for a joint conversation ("You each described expectations for ministry evenings differently. Walk me through how you'd decide that together").

### Rubric-based scoring
- Use behaviorally anchored rating scales (BARS): 1 to 4 or 1 to 5 with a short description at each level.
  - 1 = no relevant example, or example shows the opposite
  - 3 = clear, relevant example with some ownership and results
  - 5 = several examples, clear personal ownership, reflection and growth
- Each interviewer rates independently first, then discusses. Record evidence notes for each rating.
- Final judgment combines self-report, 360, couple data and interview (a "wash-up" or integration meeting), and is not driven by any single score.

---

## 5. Legal and ethical

### Copyright and trademark: what we can and cannot do
General principle: copyright protects specific expression (item wording, report text, scoring keys), not ideas, theories or facts. Trademarks protect brand names. We can measure similar ideas with our own wording, but we must not copy items or use protected names as our product names.

| Instrument | Status | What we can do |
|---|---|---|
| **IPIP** (International Personality Item Pool) | Items and scales are in the **public domain**. They may be copied, edited, translated and used for any purpose without permission or fees ([verified] on ipip.ori.org) | Safe to use or adapt Big Five and other IPIP items. Credit IPIP as good practice |
| **CliftonStrengths / StrengthsFinder** (Gallup) | Proprietary items, theme names and reports. Gallup's product terms restrict reproduction. The theme names are trademarks | Do not reuse the 34 theme names or items. Don't say "like CliftonStrengths" in marketing |
| **Predictive Index** | Proprietary, trademarked | Don't copy the adjective checklist format/content or names |
| **DISC** | The underlying DISC model (Marston, 1928) is not protected by copyright, which is why many DISC tools exist. "Everything DiSC" is a registered Wiley trademark ([verified] on discprofile.com) | We could write our own DISC-style items. Avoid "DiSC" styling and Wiley's report language. Honestly we don't need DISC at all |
| **Enneagram** | Arica Institute v. Palmer (2d Cir. 1992): the type labels and their order were not protectable, but specific creative expression can be ([verified]). Specific tests such as the RHETI (Enneagram Institute) are copyrighted | The concept is open; specific tests and descriptions are not. We recommend leaving the Enneagram out (validity evidence is weaker and theologically contested in some networks) |
| **MBTI** | Myers-Briggs, MBTI and the type descriptions are trademarks/copyright of The Myers-Briggs Company | Don't mimic 4-letter types or use the names |
| **PREPARE-ENRICH** | Proprietary items and scoring | Borrow concepts only (independent answers, couple agreement, idealistic-distortion-style candor scale) with our own wording |
| **Spiritual gifts inventories** (e.g. Wagner's *Finding Your Spiritual Gifts*, Wagner-Modified Houts) | Published and copyrighted (Baker/Chosen) | The **biblical gift lists are public domain** (Scripture). Write our own items |
| **APEST** (Hirsch, 5Q) | The specific test and the "5Q" branding belong to their authors/publisher. The Ephesians 4 fivefold concept is Scripture | Measure the five functions with our own items and credit Hirsch's work as background. Avoid "5Q/APEST Test" branding unless licensed |
| **PHQ-9 / GAD-7** | Developers (Spitzer, Williams, Kroenke) state: no permission required to reproduce, translate, display or distribute ([verified]) | Can be used verbatim with attribution. See section 7 for whether we should |
| **Maslach Burnout Inventory** | Commercially licensed (Mind Garden) | Do not use |
| **Copenhagen Burnout Inventory** | Described as a no-cost alternative to the MBI ([verified]): 19 items, personal / work / client-related burnout. Free use is widely accepted, but no formal license statement was confirmed | Prefer writing our own burnout items, or confirm terms before using the CBI's wording |

### Consent
- Separate, specific, plain-language consent for: (a) the planter, (b) the spouse **individually** (the spouse is not a party just because they're married to the candidate), and (c) observers.
- Say in plain words who sees what: "Your network leader [name] will see your answers and a report. Your spouse will / will not see your individual answers."
- Allow skipping sensitive items, with "prefer not to answer" options.
- Allow withdrawal and deletion on request.

### Data privacy for sensitive answers
- Answers about marriage, mental health, religion and abuse are **sensitive data** under laws like the Colorado Privacy Act, which requires opt-in consent that is freely given, specific, informed and unambiguous ([verified]). The CPA applies above volume thresholds (100,000 consumers a year, or 25,000 if selling data), so a small free tool may fall outside it. However, it is the right standard to follow anyway, and GDPR applies to any EU users.
- Practical rules:
  - Collect the minimum. Don't ask for things you won't use.
  - Encrypt in transit and at rest. Use row-level security (e.g. Supabase RLS) so a leader sees only their own candidates.
  - Set a retention window (e.g. delete raw answers 12 to 24 months after the report).
  - Never sell or use the data for marketing.
  - Log who viewed reports.
  - Keep safety/abuse answers in a separate, more restricted field.

### Disclaimer language (non-clinical)
Suggested wording, in our own voice:
> "This assessment is a ministry-readiness conversation tool. It is not a psychological test, a medical or mental-health diagnosis, or marriage counseling. Results are estimates based on what you and others reported, and they can be wrong. If anything here raises concerns about your health, safety or marriage, please talk with a licensed professional."

### Mandatory "not a hiring decision on its own" framing
Put this at the top of every leader report:
> "This report is one input, not a decision. No one should be approved, declined or funded based on this report alone. Use it alongside interviews, references, background checks, a track record of ministry and prayerful discernment."
- Avoid "pass/fail". Use "areas to explore."
- Remind the leader that results come from a tool with no large-sample norms yet.

---

## 6. Spiritual gifts assessment

### Biblical gift lists (public domain source material)
- **Romans 12:6–8**: prophecy, serving, teaching, exhorting/encouraging, giving, leading, mercy.
- **1 Corinthians 12:8–10, 28–30**: word of wisdom, word of knowledge, faith, healing, miracles, prophecy, distinguishing spirits, tongues, interpretation of tongues, apostles, teachers, helps, administration/guidance.
- **Ephesians 4:11**: apostles, prophets, evangelists, shepherds (pastors), teachers (the "fivefold" or APEST).
- **1 Peter 4:10–11**: speaking gifts and serving gifts.
- Commonly added by many inventories (with debated biblical basis): hospitality, craftsmanship, intercession, voluntary poverty, celibacy, missionary.

### Approach
- Write our own items (3 to 5 per gift) based on behavior and fruit others have affirmed: "Others have told me that when I explain Scripture they understand it better."
- Add a 360 version: observers indicate the gifts they've seen.
- Because gifts are a theological question, give the assessment a short doctrinal note (e.g. how a Baptist/"Bapticostal" tradition treats sign gifts) and let networks turn certain gifts on or off.
- Frame results as "where you've seen fruit and where others affirm you", not as a fixed label.

### APEST / fivefold
- APEST (Hirsch, from Ephesians 4) treats the five as functions every church needs, with each person having a primary and secondary bent.
- For planters, it helps show balance: many planters lean apostolic/evangelistic and need shepherd/teacher partners.
- Write our own 5 to 6 items per function. Consider a forced-choice block here, since all five functions are desirable and people tend to rate themselves high on everything.
- Use the APEST profile to suggest team-building, not as a readiness score.

---

## 7. Mental and emotional health screening

### What is usual in ministry candidate assessment
- Many denominational and network assessments include questions on stress, burnout, family health, family-of-origin, emotional maturity and support systems. Some also ask the candidate to complete a separate clinical evaluation by a licensed psychologist (NAMB and others use a mix of self-report, spouse involvement, interviews and references).
- A free web tool should **screen for conversation, not assess clinically**.

### What to measure (all non-clinical, own items)
- **Current stress and load**: work hours, sleep, money pressure, major life changes in the last 12 months (the PREPARE-ENRICH "Personal Stress" scale is a conceptual example).
- **Burnout signs**: exhaustion, cynicism, reduced sense of effectiveness. These are the 3 commonly researched burnout dimensions. Write our own items; don't use the MBI.
- **Rhythms and resilience**: Sabbath, friendships outside the church, counseling history (framed as a strength), spiritual practices.
- **Family of origin**: how conflict and emotions were handled growing up, and patterns they're aware of carrying. Ask about awareness and work done, not trauma details.
- **Emotional self-awareness**: owning mistakes, handling criticism.

### Flag responsibly: refer, don't diagnose
- Never output a label like "depressed" or "anxious." Use "elevated stress indicators: worth a caring conversation" instead.
- If including a validated screener, PHQ-9/GAD-7 are free to use. But they are clinical tools: if used, they need clinical follow-up procedures, and the PHQ-9 suicide item creates a duty to respond. **Recommendation: do not include the PHQ-9 suicide item**, or any clinical screener, in a network-leader report. Use non-clinical wellbeing items, plus one opt-in "Would you like information about confidential counseling?" item.
- If anything suggests immediate risk (a self-harm or safety item), show resources immediately on screen to the person (988 Suicide & Crisis Lifeline in the US, local emergency number), and do not wait for the leader.
- Shared concerns route to "Recommend a conversation with a licensed counselor before or during planting," with network-approved referral options.
- Keep health and family-of-origin details in the leader report as **summary bands**, not raw answers, unless the candidate opts in.
- Frame counseling and therapy as strengths ("has done counseling work" is a positive marker), so people don't hide them.

---

## Recommended overall architecture (summary)
1. **Planter self-assessment** (~20–25 min): competency scales mapped to Ridley's 13 characteristics, SJT block, gifts + APEST block, wellbeing block, Candor scale, consistency pairs.
2. **Spouse self-assessment** (~15 min): their own calling, readiness, expectations and wellbeing, plus paired couple items and a private channel.
3. **360** (~8–10 min each): 5 rater categories, observable behaviors only, "Not observed" option, minimum 3 per category to show a category average.
4. **Leader report**: "one input, not a decision" banner; response-quality line; profile in bands; blind spots / hidden strengths; couple agreement by area; concerns; interview guide with STAR questions and BARS rubric; "How these scores were set" appendix.
5. **Governance**: expert panel sets cut scores (modified Angoff), reviewed every 50 to 100 completions; item analysis after 100 completions; documented change log.

---

## Sources
- International Personality Item Pool (public domain statement): https://ipip.ori.org/
- IPIP overview: https://en.wikipedia.org/wiki/International_Personality_Item_Pool
- Goldberg et al., The IPIP and the future of public-domain personality measures: https://profiles.wustl.edu/en/publications/the-international-personality-item-pool-and-the-future-of-public-/
- PREPARE-ENRICH Scientific Foundation (Idealistic Distortion reliability, PCA typology): https://www.prepare-enrich.com/wp-content/uploads/2020/12/Scientific_Foundation.pdf
- Fowers & Olson 1986, Predicting Marital Success with PREPARE: https://www.prepare-enrich.com/wp-content/uploads/2020/12/Fowers-Olson-1986-Predicting-Marital-Success-With-PREPARE.pdf
- Meta-analysis of faking resistance of forced-choice inventories (Martínez et al. 2021): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8511514/
- Cao & Drasgow 2019, faking and forced-choice meta-analysis: https://www.Gwern.net/doc/psychology/personality/2019-cao.pdf
- Forced-choice measurement, Frontiers in Psychology 2021: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.732241/pdf
- Detecting careless responding, comparison of indices (Behavior Research Methods 2024): https://link.springer.com/article/10.3758/s13428-024-02484-3
- Response-time model for careless responding (Psychometrika): https://www.cambridge.org/core/product/BA21A6269DB7156800157904BB09FD42
- Eisinga et al. 2013, reliability of two-item scales: https://www.ssph-journal.org/journals/international-journal-of-public-health/articles/10.1007/s00038-012-0416-3/full
- Rammstedt & Beierlein, "Can't we make it any shorter?": https://mijn.bsl.nl/doi/pdf/10.1027/1614-0001/a000141
- Number of items and internal consistency: https://revistas.unimagdalena.edu.co/index.php/duazary/article/view/5938
- Angoff standard setting with small samples (Cambridge Assessment): https://www.cambridgeassessment.org.uk/Images/579400-comparing-small-sample-equating-with-angoff-judgement-for-linking-cut-scores-on-two-tests.pdf
- Angoff method overview: https://assess.com/?p=25449
- CCL, how many raters: https://resources.ccl.org/kb/how-many-raters-should-i-add/
- Structured interviews, moving beyond mean validity (Industrial and Organizational Psychology, 2023): https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/7CB1F7C86CB0D15328B3F07AD5F964E2/S1754942623000421a.pdf/structured-interviews-moving-beyond-mean-validity.pdf
- Ridley's 13 characteristics of church planters: https://www.dakotasumc.org/vital-congregations/church-planting/resources-for-future-church-planters/thirteen-characteristics-of-successful-planters
- Acts 29, characteristics of an effective church planter: https://www.acts29.com/characteristics-effective-church-planter/
- NAMB church planter assessment: https://namb.net/church-planter-assessment
- What to expect in a church planting assessment (NewChurches): https://newchurches.com/article/what-to-expect-in-a-church-planting-assessment
- Chi Alpha pioneering placement and assessment: https://chialpha.com/join-xa/pioneering/placement-process-and-assessment
- Which DISC is DiSC (Wiley trademark; DISC model not copyrighted): https://discprofile.com/blog/which-disc-is-disc
- Arica Institute v. Palmer, 970 F.2d 1067 (2d Cir. 1992): https://law.resource.org/pub/us/case/reporter/F2/970/970.F2d.1067.91-7859.771.html
- Enneagram Institute on "free" Enneagram tests: https://enneagraminstitute.com/?p=154
- Gallup product terms: https://wpr.gallup.com/ProductTerms
- CliftonStrengths technical report: https://www.gallup.com/file/services/176321/clifton-strengthsfinder-technical-report-development-validation.aspx
- Wagner, Finding Your Spiritual Gifts Questionnaire (Baker/Chosen): https://bakerpublishinggroup.com/books/finding-your-spiritual-gifts-questionnaire-updated-and-expanded-edition/358292
- APEST overview (church page referencing Hirsch / 5Q): https://www.tbcrichmond.org/apest
- PHQ-9 and GAD-7 ("no permission required to reproduce"): https://www.hhs.nd.gov/sites/www/files/documents/BH/BHC/PHQ-9-and-GAD-7.pdf
- Copenhagen Burnout Inventory validity (no-cost alternative to MBI): https://karger.com/dmj/article/5/2/89/823280/Internal-Reliability-and-Validity-of-Copenhagen
- Colorado Privacy Act overview (sensitive data, consent, thresholds): https://privacyrights.org/resources-tools/law-overviews/colorado-privacy-act
