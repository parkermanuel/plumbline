// Item bank. All items original. Likert 1-5 unless noted. rev:true = reverse-keyed.
// Each scale carries the report language and interview guide used by the engine.

// Bump when any question is added, removed or reworded. Saved answers keep the version they were taken on.
export const BANK_VERSION = "2026.10";

export const LIKERT = ["Strongly disagree", "Disagree", "Not sure", "Agree", "Strongly agree"];
export const OBS = ["Rarely", "Sometimes", "Often", "Very often", "Always"]; // reference frequency
export const NOT_OBSERVED = 0;

export const PILLARS = [
  { id: "calling", name: "Calling & Faith", icon: "flame", blurb: "A call you can name, a walk with God that's real, and faith that steps out.",
    why: "Calling is the first question every major network asks. Exercising faith is one of Charles Ridley's 13 traits of effective planters, drawn from planters across 13 denominations.", src: ["ridley", "send"] },
  { id: "character", name: "Character", icon: "shield", blurb: "Integrity, teachability and self-control: the things that keep a planter in the game.",
    why: "Integrity is a non-negotiable in nearly every model, from the Church Leader Inventory research behind the PCA's assessment to the elder qualifications Acts 29 assesses against (1 Timothy 3, Titus 1).", src: ["pca", "acts29"] },
  { id: "health", name: "Emotional Health", icon: "heart", blurb: "Self-awareness, resilience and rhythms that can carry the weight of planting.",
    why: "Resilience is one of Ridley's 13 traits and emotional stability is a core dimension in the Church Leader Inventory model. Networks treat emotional health as a non-negotiable.", src: ["ridley", "pca"] },
  { id: "family", name: "Marriage & Family", icon: "home", blurb: "A marriage and home that are a strength, not a casualty.",
    why: "Spousal cooperation is one of Ridley's 13 traits, and Send Network leaders say plainly that if the spouse isn't ready, the planter isn't ready. In a 2017 LifeWay study, 69% of pastors' spouses said they have few people to confide in.", src: ["ridley", "send", "spouses2017"] },
  { id: "leadership", name: "Leadership", icon: "compass", blurb: "Vision, teams, leader development and healthy conflict.",
    why: "In the 2007 Church Plant Survivability Study, plants that developed members as leaders survived at 79% compared with 59% for those that didn't.", src: ["survive2007"] },
  { id: "mission", name: "Mission", icon: "send", blurb: "Living among people far from God, sharing the gospel and making disciples.",
    why: "Relating to the unchurched and responding to the community are core Ridley traits. In Ed Stetzer's 2003 study of 601 plants, assessed planters averaged about twice as many conversions by year four.", src: ["ridley", "stetzer2003"] },
  { id: "capacity", name: "Planting Capacity", icon: "seed", blurb: "Drive, adaptability, money, expectations, communication and systems to build from nothing.",
    why: "In the 2007 survivability study, plants whose planter held realistic expectations survived at 87% compared with 61%, and plants with a stewardship plan survived at 81% compared with 68%.", src: ["survive2007"] },
];

export const SOURCES = {
  ridley: { t: "Charles Ridley, behavioral dimensions of effective church planters (Indiana University, late 1980s)", url: "https://www.dakotasumc.org/vital-congregations/church-planting/resources-for-future-church-planters/thirteen-characteristics-of-successful-planters" },
  send: { t: "Send Network / NAMB church planter assessment", url: "https://namb.net/church-planter-assessment" },
  pca: { t: "PCA Mission to North America, What Is Church Planter Assessment", url: "https://resources.pcamna.org/wp-content/uploads/sites/3/2024/09/What-is-Church-Planter-Assessment.pdf" },
  acts29: { t: "Acts 29, Characteristics of an Effective Church Planter", url: "https://www.acts29.com/characteristics-effective-church-planter/" },
  spouses2017: { t: "LifeWay Research, pastors' spouses study (2017), via Baptist Standard", url: "https://baptiststandard.com/news/faith-culture/pastors-spouses-experience-mixed-blessings/" },
  survive2007: { t: "Church Plant Survivability and Health Study (NAMB / Leadership Network, 2007), via Christian Post", url: "https://christianpost.com/news/study-10-factors-for-church-plant-success.html" },
  stetzer2003: { t: "Ed Stetzer, study of 601 church plants (2003), via Baptist Press", url: "https://www.baptistpress.com/?p=96825" },
  ipip: { t: "International Personality Item Pool (public domain), which informed the Wiring dimensions", url: "https://ipip.ori.org/" },
  angoff: { t: "Modified Angoff standard-setting method", url: "https://assess.com/?p=25449" },
};

export const WORK_SAMPLES = [
  { id: "ws_vision", q: "A video of you casting the vision for your plant (about 3 minutes)", hint: "YouTube, Vimeo or Drive link" },
  { id: "ws_sermon", q: "A recent sermon", hint: "Video or audio link" },
  { id: "ws_plan", q: "Your launch plan or prospectus, if you have one", hint: "Link to a document" },
];
export const WORK_RUBRIC = [
  { id: "ws_vision", name: "Vision cast", anchors: ["Unclear or generic", "Clear but not compelling", "Clear, specific and compelling, ends with an ask", "Moving; I'd want to join"] },
  { id: "ws_sermon", name: "Sermon", anchors: ["Hard to follow or not grounded in the text", "Biblical but dry or insider-focused", "Clear, biblical and accessible to outsiders", "Clear, biblical, compelling and calls for a response"] },
  { id: "ws_plan", name: "Launch plan", anchors: ["Missing or vague", "Some pieces in place", "Realistic plan with people, money and timeline", "Thorough, realistic and grounded in the city"] },
];

// q: interview question (STAR). probes: follow-ups. plan: 90-day growth step. look: what a strong answer shows.
export const SCALES = {
  // ---------- CALLING & FAITH ----------
  call: {
    pillar: "calling", name: "Clarity of Call",
    desc: "Can name why God is calling them to plant (not just pastor), and others have confirmed it.",
    strength: "Speaks about the call with clarity and conviction, and others have confirmed it.",
    growth: "The call to plant is not yet clear or confirmed. Planting on an unclear call is one of the hardest places to stand when things get difficult.",
    q: "Tell me the story of how you sensed God calling you to plant. Who confirmed it, and how?",
    probes: ["What would you do if the plant didn't happen?", "When did you last doubt the call, and what settled it?"],
    look: "A specific story, outside confirmation, and a call that holds up without the plant succeeding.",
    plan: "Write your calling story in one page. Share it with three people who know you well and ask: 'Do you see this in me?'",
    items: [
      { id: "c1", t: "I can explain in a few sentences why God is calling me to plant, not just to pastor." },
      { id: "c2", t: "People who know me well have confirmed this calling without my asking them to." },
      { id: "c3", t: "If a well-paid staff role opened up tomorrow, I would still choose to plant." },
      { id: "c4", t: "Some days I wonder if I'm planting mostly because other options didn't work out.", rev: true },
      { id: "c5", t: "I sense God sending me to a specific place or people." },
    ],
  },
  devotion: {
    pillar: "calling", name: "Walk with God",
    desc: "Time with God that is regular and real, apart from sermon prep.",
    strength: "Has an unhurried, regular walk with God that is not tied to ministry output.",
    growth: "Time with God is thin or tends to disappear under ministry pressure. Planting will press on this harder than anything has before.",
    q: "Walk me through your time with God this past week. What has God been showing you lately?",
    probes: ["What happens to your time with God when you're busiest?", "Who knows how your soul is really doing?"],
    look: "Specific, recent, personal: not sermon prep, and not a performance.",
    plan: "Set a daily 20-minute appointment with God that is not sermon prep. Tell one person and let them ask you about it weekly.",
    items: [
      { id: "d1", t: "Most weeks I spend unhurried time in Scripture that isn't for sermon prep or teaching." },
      { id: "d2", t: "Prayer is a daily part of my life, not an occasional one." },
      { id: "d3", t: "My time with God tends to disappear when ministry gets busy.", rev: true },
      { id: "d4", t: "I can name a specific way God has changed me in the past year." },
      { id: "d5", t: "I regularly confess sin to at least one trusted person." },
    ],
  },
  faith: {
    pillar: "calling", name: "Faith that Steps Out",
    desc: "Willing to act before every resource is in place, and to take risks that depend on God.",
    strength: "Has a track record of stepping out in faith and leading before everything is in place.",
    growth: "Uncertainty tends to freeze them. Planting asks a leader to move before the money, people and building are there.",
    q: "Tell me about a time you stepped out in faith on something that could have failed publicly. What happened?",
    probes: ["What did you do while you waited?", "How did you know it was faith and not just a risk?"],
    look: "Real risk, prayer and action together, and peace either way.",
    plan: "Name one faith step you've been putting off. Pray over it with your spouse and a mentor and set a date to take it.",
    items: [
      { id: "f1", t: "I have stepped out in faith on something that could have failed publicly." },
      { id: "f2", t: "I can lead with confidence before all the resources are in place." },
      { id: "f3", t: "Uncertainty about money or results tends to freeze me.", rev: true },
      { id: "f4", t: "When I pray big prayers, I also take concrete steps toward the answer." },
    ],
  },

  // ---------- CHARACTER ----------
  integrity: {
    pillar: "character", name: "Integrity",
    desc: "The private life matches the public one; word is kept; accountability is real.",
    strength: "Lives an open, accountable life. Their word is good.",
    growth: "There are signs of a gap between private and public life, or accountability that isn't real yet. This is the foundation everything else stands on.",
    q: "Who in your life asks you the hardest questions, and when did they last ask? What did you tell them?",
    probes: ["What would you not want your network leader to find out later?", "How do you handle screens, money and time when no one is watching?"],
    look: "A named person, real questions, honest answers, and no defensiveness.",
    plan: "Set up a weekly accountability conversation with specific questions about money, screens, time and thought life.",
    items: [
      { id: "i1", t: "My private life would hold up if my leaders could see all of it." },
      { id: "i2", t: "I keep my word even when it costs me." },
      { id: "i3", t: "I sometimes shade the truth to protect how people see me.", rev: true },
      { id: "i4", t: "My screen habits would hold up to an honest audit." },
      { id: "i5", t: "Someone asks me hard questions about my life, and I give them honest answers." },
    ],
  },
  humility: {
    pillar: "character", name: "Teachability",
    desc: "Receives correction, owns mistakes, shares credit.",
    strength: "Receives correction well, owns mistakes quickly and gives credit away.",
    growth: "Receiving correction and owning mistakes doesn't come easily. A planter without a boss nearby has to choose to stay teachable.",
    q: "Tell me about the most helpful criticism you've received in the last two years. What did you do with it?",
    probes: ["What did you push back on at first?", "Who would say you didn't receive their feedback well?"],
    look: "Specific criticism, real change, and gratitude toward the person.",
    plan: "Ask three people you lead: 'What's one thing I could do better?' Write their answers down, thank them, and change one thing.",
    items: [
      { id: "h1", t: "When someone criticizes me, I look first for what is true in it." },
      { id: "h2", t: "I find it hard to take direction from leaders I think are less gifted than me.", rev: true },
      { id: "h3", t: "I ask for feedback I don't have to ask for." },
      { id: "h4", t: "I give credit to others publicly." },
      { id: "h5", t: "I tend to explain my mistakes before I own them.", rev: true },
    ],
  },
  control: {
    pillar: "character", name: "Self-Control",
    desc: "Calm and kind under pressure; the same person at home as on stage.",
    strength: "Stays steady and kind under pressure, and is the same at home as in public.",
    growth: "Frustration or anger shows up in ways others feel. Planting multiplies pressure, and pressure reveals this quickly.",
    q: "Tell me about the last time you lost your cool with someone. What happened, and what did you do afterward?",
    probes: ["What does your spouse see when you're under pressure?", "Who has to walk on eggshells around you?"],
    look: "Honest ownership, repair with the person, and a pattern that's getting better.",
    plan: "Ask your spouse to name what you're like under stress. Pick one trigger and plan a better response with a mentor or counselor.",
    items: [
      { id: "w1", t: "When I'm frustrated, I take it out on the people around me.", rev: true },
      { id: "w2", t: "I stay calm and kind in heated conversations." },
      { id: "w3", t: "More than once this year I've said things in anger that I later regretted.", rev: true },
      { id: "w4", t: "My family would say I'm the same person at home as I am on stage." },
    ],
  },

  // ---------- EMOTIONAL HEALTH ----------
  awareness: {
    pillar: "health", name: "Self-Awareness",
    desc: "Knows their feelings, triggers and story, and has done work on it.",
    strength: "Knows themselves well: their feelings, triggers and how their story shapes their leadership.",
    growth: "Doesn't yet see their own patterns clearly. What we don't see in ourselves, our team usually pays for.",
    q: "How did your family handle conflict and emotion growing up, and how does that show up in your leadership today?",
    probes: ["What have you done to work on it?", "What would your team say triggers you?"],
    look: "Clear connections between story and present, and real work done (counselor, mentor, pastor).",
    plan: "Meet with a counselor or trusted mentor for three sessions focused on your family of origin and how you lead under stress.",
    items: [
      { id: "a1", t: "I can name what I'm feeling in the moment, not just later." },
      { id: "a2", t: "I know the situations that tend to bring out my worst reactions." },
      { id: "a3", t: "I understand how my family growing up shaped how I handle conflict." },
      { id: "a4", t: "Others usually have to tell me when I'm stressed; I don't notice it myself.", rev: true },
      { id: "a5", t: "I have worked through my own story with a counselor, mentor or pastor." },
    ],
  },
  resilience: {
    pillar: "health", name: "Resilience",
    desc: "Bounces back from setbacks, rejection and slow results.",
    strength: "Bounces back from setbacks and stays hopeful when results are slow.",
    growth: "Setbacks and criticism hit hard and stay long. Planting has a lot of both.",
    q: "Tell me about the hardest season of ministry you've walked through. How did you get through it?",
    probes: ["How long did it take you to recover?", "What would you do differently?"],
    look: "A real hardship, honest struggle, healthy supports, and growth on the other side.",
    plan: "List your three biggest past setbacks and what helped you recover. Build those supports into your planting plan on purpose.",
    items: [
      { id: "r1", t: "I bounce back from a discouraging Sunday within a day or two." },
      { id: "r2", t: "I have walked through a real ministry hardship and come out healthier." },
      { id: "r3", t: "Rejection or criticism can knock me down for a week or more.", rev: true },
      { id: "r4", t: "I can stay hopeful when results are slow." },
    ],
  },
  rhythms: {
    pillar: "health", name: "Rhythms & Rest",
    desc: "Sabbath, sleep, friendships outside the church, and things that refill them.",
    strength: "Keeps healthy rhythms: a protected day off, friends outside the church and things that refill them.",
    growth: "The pace isn't sustainable right now. Planters rarely slow down after launch, so the rhythms have to be built before it.",
    q: "Describe your typical week. When do you rest, and what actually refills you?",
    probes: ["When did you last take a full day off with no ministry?", "Who are your friends who don't need you to be their pastor?"],
    look: "A protected day off, sleep, and at least one friendship outside the ministry.",
    plan: "Pick a weekly Sabbath day, put it on the calendar for the next 12 weeks, and let your spouse hold you to it.",
    items: [
      { id: "y1", t: "I take a weekly Sabbath or day off and protect it." },
      { id: "y2", t: "I have friendships where I'm not the pastor." },
      { id: "y3", t: "I get enough sleep most nights." },
      { id: "y4", t: "My schedule regularly runs past what my family and I agreed to.", rev: true },
      { id: "y5", t: "I regularly do something that refills me and has nothing to do with ministry." },
    ],
  },
  load: {
    pillar: "health", name: "Current Load",
    desc: "Signs of exhaustion, cynicism and pressure right now. Non-clinical.",
    strength: "Has energy and margin for the season ahead.",
    growth: "Shows signs of running on empty right now: exhaustion, cynicism or heavy pressure. Starting a plant from here is risky. This is a caring conversation, not a diagnosis.",
    q: "On a scale of 1 to 10, how full is your tank right now? What's draining it most?",
    probes: ["What would need to change for you to start planting from a full tank?", "Have you talked with anyone about this?"],
    look: "Honest self-report and a plan, not bravado.",
    plan: "Talk with a counselor or pastor about your current load before setting a launch date. Remove one commitment this month.",
    items: [
      { id: "l1", t: "Lately I feel exhausted even after a day off.", rev: true },
      { id: "l2", t: "I've become more cynical about people than I used to be.", rev: true },
      { id: "l3", t: "I often feel that what I do doesn't make much difference.", rev: true },
      { id: "l4", t: "I have energy and excitement for the next season." },
      { id: "l5", t: "Money pressure is a constant weight on me right now.", rev: true },
    ],
  },

  // ---------- MARRIAGE & FAMILY (planter view) ----------
  partnership: {
    pillar: "family", name: "Marriage Partnership", married: true,
    desc: "Decides together, works through conflict well, and the marriage is a strength.",
    strength: "The marriage is a real partnership and a source of strength.",
    growth: "The marriage partnership needs attention before planting. Plants rarely fix a strained marriage; they usually expose it.",
    q: "How do the two of you make big decisions? Tell me about the decision to plant.",
    probes: ["Tell me about your last real disagreement and how it got resolved.", "What would your spouse say you need to work on?"],
    look: "Both voices in the story, a healthy conflict pattern, and no surprises between them.",
    plan: "Schedule a weekly 30-minute couple meeting: calendar, money, kids, and 'how are we, really?'",
    items: [
      { id: "m1", t: "My spouse and I make big decisions together." },
      { id: "m2", t: "My spouse feels genuinely called to this, not just supportive of me." },
      { id: "m3", t: "I sometimes make ministry commitments before checking with my spouse.", rev: true },
      { id: "m4", t: "We have a healthy way of working through disagreements." },
      { id: "m5", t: "Our marriage is a source of strength right now, not strain." },
    ],
  },
  family: {
    pillar: "family", name: "Family First", married: true,
    desc: "Clear limits so the family doesn't get the leftovers.",
    strength: "Protects the family with clear limits; the family isn't getting leftovers.",
    growth: "The family is at risk of getting what's left after ministry. Kids remember how planting felt at home.",
    q: "What will your kids remember about the year you planted? What are you doing now to shape that?",
    probes: ["Which nights are off-limits for ministry?", "How will you know if your family is paying too high a price?"],
    look: "Specific limits, the kids' perspective considered, and early warning signs named.",
    plan: "Hold a family meeting about the plant. Ask each person what they're excited about and nervous about, and agree on two family rhythms to protect.",
    items: [
      { id: "k1", t: "My family would say ministry doesn't steal me from them." },
      { id: "k2", t: "I have clear limits on evenings and weekends for ministry." },
      { id: "k3", t: "My family often gets what's left over after ministry.", rev: true },
      { id: "k4", t: "We've talked about how planting will affect each person in our home." },
    ],
  },
  support: {
    pillar: "family", name: "Support & Relationships", single: true,
    desc: "For single planters: a real support system and healthy relationships.",
    strength: "Has a strong circle of support and healthy close relationships.",
    growth: "The support system is thin. Single planters especially need people around them who aren't in the church.",
    q: "Who are the three people you'll call when planting gets hard? How often do you talk now?",
    probes: ["Who in your life is not impressed by you?", "How will you guard against isolation in a new city?"],
    look: "Named people, regular contact, and honesty with them.",
    plan: "Name three people outside the plant and set a standing call with each of them for the first year.",
    items: [
      { id: "sp1", t: "I have at least three close friends I can be completely honest with." },
      { id: "sp2", t: "I have a mentor or pastor I can call in a hard week." },
      { id: "sp3", t: "I often feel alone in ministry.", rev: true },
      { id: "sp4", t: "I have a plan for building friendships in a new city that aren't just ministry." },
    ],
  },

  // ---------- LEADERSHIP ----------
  vision: {
    pillar: "leadership", name: "Vision Casting",
    desc: "Paints a picture of the future people want to give themselves to, and turns it into steps.",
    strength: "Casts a compelling vision and turns it into clear next steps.",
    growth: "Vision is either unclear or hard for others to follow. People don't join a plant; they join a picture of the future.",
    q: "Cast the vision of your church plant for me in two minutes, as if I'm a potential launch team member.",
    probes: ["Tell me about a time people rallied to a vision you cast. What did they actually do?", "What's the very next step you'd ask me to take?"],
    look: "Clear, compelling, specific to a place, and ending in a concrete ask.",
    plan: "Write your vision in one sentence, one paragraph and a ten-minute talk. Pitch it to five people and refine it from their questions.",
    items: [
      { id: "v1", t: "I can paint a picture of the future that makes people want to give their lives to it." },
      { id: "v2", t: "People have rallied to a vision I cast and actually followed through." },
      { id: "v3", t: "I can explain my vision clearly in one sentence." },
      { id: "v4", t: "I tend to have big ideas that others find hard to follow.", rev: true },
      { id: "v5", t: "I turn vision into clear next steps people can take." },
    ],
  },
  team: {
    pillar: "leadership", name: "Building Teams",
    desc: "Recruits people, keeps them, and makes them feel like owners.",
    strength: "Builds teams where people stay and feel like owners.",
    growth: "Tends to do it themselves or struggles to keep volunteers. A plant can't grow past what the planter can personally carry without a team.",
    q: "Tell me about a team you built from scratch. How did you recruit them, and who is still on it?",
    probes: ["Who left, and why?", "How do people on your team know they're owners and not helpers?"],
    look: "Real names, retention, delegation of meaningful work, and celebration.",
    plan: "Recruit three people to a specific role this month. Hand each of them a real outcome to own, not just a task.",
    items: [
      { id: "t1", t: "I've recruited volunteers who stayed for more than a year." },
      { id: "t2", t: "People I lead act like owners, not helpers." },
      { id: "t3", t: "It's usually faster to do things myself, so I do.", rev: true },
      { id: "t4", t: "I can build a team with people who are very different from me." },
      { id: "t5", t: "I regularly celebrate the wins of the people I lead." },
    ],
  },
  develop: {
    pillar: "leadership", name: "Developing Leaders",
    desc: "Raises up leaders who lead others; hands off real authority.",
    strength: "Raises up leaders who lead others, and hands off real authority.",
    growth: "Developing leaders isn't a habit yet. Plants multiply at the speed of leaders.",
    q: "Tell me about someone you developed who now leads others. What did you do with them?",
    probes: ["What authority did you hand them, not just tasks?", "Who are you developing right now?"],
    look: "A named leader who now leads others, and a repeatable way of doing it.",
    plan: "Pick two potential leaders. Meet with each every other week for 90 days and hand them one area to lead.",
    items: [
      { id: "dv1", t: "I have developed someone who now leads others." },
      { id: "dv2", t: "I am meeting with someone right now to grow them as a leader." },
      { id: "dv3", t: "I struggle to hand off real authority, not just tasks.", rev: true },
      { id: "dv4", t: "I spot leadership potential in people before they see it." },
      { id: "dv5", t: "I have a simple, repeatable way to move people from attender to leader." },
    ],
  },
  conflict: {
    pillar: "leadership", name: "Healthy Conflict",
    desc: "Addresses problems early and directly, firm without being harsh.",
    strength: "Handles conflict early and directly, with grace.",
    growth: "Tends to avoid hard conversations or handle them harshly. Small problems in a young church grow fast.",
    q: "Tell me about a hard conversation you had with someone you lead. How did you prepare, and how did it go?",
    probes: ["What conversation are you putting off right now?", "What did the relationship look like afterward?"],
    look: "Early, direct, prepared, kind, and the relationship intact or stronger.",
    plan: "Have the hard conversation you've been putting off within two weeks. Debrief it with a mentor afterward.",
    items: [
      { id: "cf1", t: "I address problems with people directly and early." },
      { id: "cf2", t: "I put off hard conversations, hoping things will improve.", rev: true },
      { id: "cf3", t: "After conflict, my relationships usually end up stronger." },
      { id: "cf4", t: "I can hold a firm line without becoming harsh." },
    ],
  },

  // ---------- MISSION ----------
  unchurched: {
    pillar: "mission", name: "Among the Unchurched",
    desc: "Real friendships with people who don't follow Jesus.",
    strength: "Has real, ongoing friendships with people far from God.",
    growth: "Life is mostly lived inside the church. New churches reach new people through the planter's own relationships first.",
    q: "Tell me about three people far from God you spent time with this month. What are they like?",
    probes: ["How did you meet them?", "What do they think about you being a pastor?"],
    look: "Names, real friendship (not projects), and ease talking about faith.",
    plan: "Join one community space where you're not the pastor (a gym, a team, a club) and show up weekly for 90 days.",
    items: [
      { id: "u1", t: "Most weeks I spend real time with people who don't follow Jesus." },
      { id: "u2", t: "People who aren't Christians enjoy being around me." },
      { id: "u3", t: "Almost all of my close friendships are inside the church.", rev: true },
      { id: "u4", t: "I can talk about faith with a skeptic without getting defensive." },
      { id: "u5", t: "I know my neighbors by name." },
    ],
  },
  evangelism: {
    pillar: "mission", name: "Personal Evangelism",
    desc: "Shares the gospel and invites people to follow Jesus, personally and often.",
    strength: "Shares the gospel personally and often, and trains others to do it.",
    growth: "Personal evangelism isn't a regular rhythm yet. A new church reaches new people first through the planter's own relationships and conversations.",
    q: "Tell me about the last time you personally led someone to faith in Jesus. Walk me through the conversation.",
    probes: ["How often do you invite people to follow Jesus, not just to church?", "Who have you trained to share their faith?"],
    look: "Recent, personal, clear gospel, and a habit, not a one-time story.",
    plan: "Write your two-minute gospel explanation. Pray for five people by name daily and look for one gospel conversation a week.",
    items: [
      { id: "e1", t: "In the past year I have personally led someone to faith in Jesus." },
      { id: "e2", t: "I regularly invite people to follow Jesus, not just to come to church." },
      { id: "e3", t: "Sharing the gospel one-on-one makes me uncomfortable enough that I rarely do it.", rev: true },
      { id: "e4", t: "I can explain the gospel clearly in two minutes." },
      { id: "e5", t: "I've trained others to share their faith." },
    ],
  },
  disciple: {
    pillar: "mission", name: "Making Disciples",
    desc: "Walks people from new faith to maturity, and they in turn disciple others.",
    strength: "Makes disciples who make disciples, with a clear pathway.",
    growth: "Producing attenders more than disciples. A church plant's long-term health depends on a discipleship pathway from day one.",
    q: "Name someone you walked with from new faith toward maturity. What did that look like week to week?",
    probes: ["Who are they discipling now?", "What's your pathway for a brand-new believer?"],
    look: "Named people, multiple generations, and a simple pathway.",
    plan: "Start one discipleship group of 2 to 4 people this quarter with a clear plan and the goal that each will lead their own.",
    items: [
      { id: "dm1", t: "I can name people I've walked with from new faith to maturity." },
      { id: "dm2", t: "I have a clear pathway for helping a new believer grow." },
      { id: "dm3", t: "My ministry produces more attenders than disciples.", rev: true },
      { id: "dm4", t: "People I've discipled are now discipling others." },
    ],
  },
  context: {
    pillar: "mission", name: "Reading the Community",
    desc: "Studies the city and adapts methods without changing the message.",
    strength: "Studies the community and adapts methods without changing the message.",
    growth: "Tends to bring a ready-made model instead of reading the city. The best plants are shaped by the people they're trying to reach.",
    q: "Describe the people you're called to reach. What do they care about, and what keeps them from Jesus?",
    probes: ["How did you learn that?", "What will your church do differently because of it?"],
    look: "Real research (conversations, data), specific barriers, and adaptations that keep the gospel intact.",
    plan: "Have 20 conversations with people in your target community. Ask what they love about the city, what they'd change and what they think of church.",
    items: [
      { id: "x1", t: "I study a community's people, needs and culture before deciding how to reach them." },
      { id: "x2", t: "I can adapt how ministry looks without changing the gospel." },
      { id: "x3", t: "I'd probably plant the same kind of church I came from, wherever I went.", rev: true },
      { id: "x4", t: "I know the felt needs and spiritual barriers of the people I'm called to." },
    ],
  },

  // ---------- PLANTING CAPACITY ----------
  drive: {
    pillar: "capacity", name: "Self-Starter",
    desc: "Starts and finishes things without being pushed; has built something from nothing.",
    strength: "A self-starter who builds and finishes without outside pressure.",
    growth: "Works best with outside structure and deadlines. A planter's calendar is blank until they fill it.",
    q: "Tell me about something you built from nothing. What did you do in the first 90 days?",
    probes: ["What did you do when no one was holding you accountable?", "What did you quit, and why?"],
    look: "Initiative, persistence, and results without a boss.",
    plan: "Set three 90-day goals for your planting preparation, review them weekly, and share them with your coach.",
    items: [
      { id: "s1", t: "I start things without being told, and I finish them." },
      { id: "s2", t: "I set my own goals and hold myself to them." },
      { id: "s3", t: "Without outside deadlines, I tend to drift.", rev: true },
      { id: "s4", t: "I have built something from nothing before (a ministry, business or team)." },
      { id: "s5", t: "I work hard when no one is watching." },
    ],
  },
  adapt: {
    pillar: "capacity", name: "Adaptability",
    desc: "Changes course quickly, leads in messy and unclear situations.",
    strength: "Adjusts quickly and leads well in messy, unclear situations.",
    growth: "Change and ambiguity are hard. Almost nothing in a plant goes as planned.",
    q: "Tell me about a plan that failed. How fast did you notice, and what did you change?",
    probes: ["How do you lead when there isn't a clear answer?", "What change has been hardest for you?"],
    look: "Quick learning, calm in the mess, and no blaming.",
    plan: "After every big event or Sunday for the next 12 weeks, write: what worked, what didn't, one change. Make the change.",
    items: [
      { id: "ad1", t: "When a plan fails, I change course quickly." },
      { id: "ad2", t: "I'm comfortable leading when things are messy and unclear." },
      { id: "ad3", t: "Unexpected changes throw me off for a long time.", rev: true },
      { id: "ad4", t: "I can learn a new skill quickly when the mission needs it." },
    ],
  },
  money: {
    pillar: "capacity", name: "Money & Fundraising",
    desc: "Asks for money without apology, has raised it before, and manages household and church finances.",
    strength: "Raises money with confidence and manages money wisely.",
    growth: "Money is an area to strengthen: asking, budgeting or both. In the 2007 survivability study, plants with a clear stewardship plan survived at 81%, compared with 68%.",
    q: "Tell me about the last time you asked someone to give. How did you ask, and what happened?",
    probes: ["Walk me through your household budget. Who manages it?", "What's your fundraising plan for the first three years?"],
    look: "Comfort asking, a real budget at home, and a realistic plan.",
    plan: "Build a three-year funding plan with your network. Make five personal asks in the next 30 days.",
    items: [
      { id: "$1", t: "I can ask people to give financially without apologizing." },
      { id: "$2", t: "I have raised money for ministry before." },
      { id: "$3", t: "Our household follows a budget." },
      { id: "$4", t: "Talking about money makes me uncomfortable enough that I avoid it.", rev: true },
      { id: "$5", t: "I understand how a church budget works." },
    ],
  },
  comms: {
    pillar: "capacity", name: "Communicating God's Word",
    desc: "Preaches and teaches clearly, including to people with no church background.",
    strength: "Communicates God's Word clearly and helps people take next steps.",
    growth: "Communication needs development, especially for people with no church background. In a new church, the Sunday message carries a lot of weight.",
    q: "What's a sermon you preached that you'd want me to hear? What made it work?",
    probes: ["How do you prepare?", "Who gives you honest feedback on your preaching?"],
    look: "Clear, biblical, and accessible to outsiders, with a habit of getting feedback.",
    plan: "Preach or teach at least monthly for the next six months. Get written feedback from two people each time.",
    items: [
      { id: "cm1", t: "People regularly tell me my preaching helped them take a next step." },
      { id: "cm2", t: "I can explain Scripture clearly to people with no church background." },
      { id: "cm3", t: "I preach or teach regularly right now." },
      { id: "cm4", t: "My preaching connects better with Christians than with people far from God.", rev: true },
    ],
  },
  expect: {
    pillar: "capacity", name: "Realistic Expectations",
    desc: "Expects planting to be slow, hard and long, and has a plan for when it is.",
    strength: "Holds realistic expectations about how long and hard planting is, with a plan for the hard days.",
    growth: "Expectations may be higher or faster than most plants experience. In the 2007 Church Plant Survivability Study, plants whose planter held realistic expectations survived at 87%, compared with 61%.",
    q: "What do you expect attendance, giving and your own life to look like 18 months after launch? Where did those numbers come from?",
    probes: ["What will you do if launch Sunday is half what you hope?", "Which planters a few years ahead have you asked about their first two years?"],
    look: "Numbers grounded in real plants nearby, a plan B, and peace with slow growth.",
    plan: "Interview three planters who launched in the last five years in a similar city. Ask what surprised them, then rewrite your first-two-years plan.",
    items: [
      { id: "ex1", t: "I expect it will take at least three years for our church to be self-sustaining." },
      { id: "ex2", t: "I've asked several planters what their first two years were really like." },
      { id: "ex3", t: "Our plan only works if the launch is large.", rev: true },
      { id: "ex4", t: "I have a plan for what we'll do if attendance or giving is half of what I hope." },
      { id: "ex5", t: "I'm at peace with the church growing slowly if it grows healthy." },
    ],
  },
  systems: {
    pillar: "capacity", name: "Systems & Follow-Through",
    desc: "Builds simple systems and makes sure details get done (personally or through others).",
    strength: "Builds simple systems so details get done and things don't depend on them.",
    growth: "Details fall through the cracks. This is often fixed by the right partner, not by becoming someone else.",
    q: "What falls through the cracks around you, and who catches it?",
    probes: ["Who on your team is strong where you're weak?", "What system have you built that runs without you?"],
    look: "Honest about weakness and a real plan to cover it: a person or a system.",
    plan: "Recruit an administrative partner (volunteer or staff) before launch, and build one simple system for guest follow-up.",
    items: [
      { id: "sy1", t: "I build simple systems so things don't depend on me." },
      { id: "sy2", t: "I follow up on details, or I have someone who reliably does." },
      { id: "sy3", t: "Things often fall through the cracks around me.", rev: true },
      { id: "sy4", t: "I know my administrative weaknesses and have a plan to cover them." },
    ],
  },
};

// ---------- SPOUSE-ONLY SCALES ----------
export const SPOUSE_SCALES = {
  s_call: {
    label: "Personal Calling",
    desc: "A personal sense of God's call to this, not just support for a spouse.",
    strength: "Has a personal, owned sense of God's call to plant.",
    growth: "The call feels more like support for a spouse than a personal conviction. That's important to talk about gently and honestly before planting.",
    q: "Tell me how you've heard from God about planting, in your own time with Him.",
    probes: ["What are you most excited about?", "What would you say if you knew no one would be disappointed?"],
    look: "Personal conviction, specific hopes, and freedom to be honest.",
    plan: "Take a personal retreat day to pray about the plant on your own, and write down what you sense God saying to you.",
    items: [
      { id: "sc1", t: "I personally sense God calling our family to plant." },
      { id: "sc2", t: "I'm excited about this, not just willing." },
      { id: "sc3", t: "If I'm honest, I'm going along with this mostly for my spouse's sake.", rev: true },
      { id: "sc4", t: "I've heard from God about this in my own time with Him." },
      { id: "sc5", t: "I can name what I'm hoping God will do through me in this plant." },
    ],
  },
  s_devotion: {
    label: "Walk with God",
    desc: "Time with God that is regular and real.",
    strength: "Has a real, regular walk with God.",
    growth: "Time with God is thin right now. Planting families need their own roots, not borrowed ones.",
    q: "How is your soul right now? Where do you meet with God?",
    probes: ["What happens to that time when life is busiest?"],
    look: "Personal, recent and real.",
    plan: "Set a daily time with God that fits this season of life, and invite a friend to check in on it.",
    items: [
      { id: "sd1", t: "I spend regular time in Scripture and prayer." },
      { id: "sd2", t: "My time with God tends to disappear when life gets busy.", rev: true },
      { id: "sd3", t: "I can name a specific way God has changed me in the past year." },
      { id: "sd4", t: "I have someone I'm honest with about my spiritual life." },
    ],
  },
  s_partner: {
    label: "Partnership (from my side)",
    desc: "Feels heard, valued as a partner, and free to disagree.",
    strength: "Feels like a true partner: heard, valued and free to disagree.",
    growth: "Doesn't fully feel like a partner in this yet. That gap matters more than almost anything else in planting.",
    q: "Do you feel like a partner in this decision? Tell me about a time you disagreed and how it went.",
    probes: ["What would you want your spouse to hear from you that's hard to say?"],
    look: "Freedom to disagree, feeling heard, and no fear in the answer.",
    plan: "Ask your spouse for a weekly couple meeting where you set half the agenda.",
    items: [
      { id: "sm1", t: "My spouse listens to me before making major decisions." },
      { id: "sm2", t: "I feel like a partner in this, not an add-on." },
      { id: "sm3", t: "Ministry has come before our family more often than I've said out loud.", rev: true },
      { id: "sm4", t: "I'm comfortable telling my spouse when I disagree." },
      { id: "sm5", t: "My spouse protects our family time." },
    ],
  },
  s_health: {
    label: "Health & Resilience",
    desc: "Self-awareness, rest and energy for the season ahead.",
    strength: "Is healthy, rested and resilient for the season ahead.",
    growth: "Is running low right now. A spouse's health is as important to a plant as the planter's.",
    q: "What fills you up, and how often do you get it right now?",
    probes: ["What drains you most?", "What would you need to thrive in the first year of the plant?"],
    look: "Self-knowledge, real rest, and named needs.",
    plan: "Name two things that refill you and put them on the family calendar every week.",
    items: [
      { id: "sh1", t: "I know what refills me, and I get it regularly." },
      { id: "sh2", t: "Lately I feel exhausted even after rest.", rev: true },
      { id: "sh3", t: "I bounce back from hard weeks fairly quickly." },
      { id: "sh4", t: "I have worked through my own story with a counselor, mentor or pastor." },
      { id: "sh5", t: "I feel anxious about the future more often than not.", rev: true },
    ],
  },
  s_support: {
    label: "Support & Community",
    desc: "Has friends and community of their own.",
    strength: "Has friends and a plan for community of their own.",
    growth: "Support is thin. In a 2017 LifeWay study, 69% of pastors' spouses said they have few people to confide in, so this is worth planning for now.",
    q: "Who are your people? Who will be your people in the new city?",
    probes: ["Who could you call on your hardest day?"],
    look: "Named friends and a plan that isn't only through the church.",
    plan: "Name two friends you'll keep a standing call with for the first year, and one way you'll find community in the new city.",
    items: [
      { id: "ss1", t: "I have at least one friend I could call in a hard week." },
      { id: "ss2", t: "I'm comfortable with the visibility that comes with being in a planting family." },
      { id: "ss3", t: "I worry about being lonely in a new city or new church.", rev: true },
      { id: "ss4", t: "I know how I'll find community for myself, not just for the church." },
    ],
  },
  s_ready: {
    label: "Practical Readiness",
    desc: "At peace with the money, move and schedule that planting brings.",
    strength: "Is at peace with the real costs: money, moving and the schedule.",
    growth: "Has unspoken fears or isn't settled on the practical costs yet. Better to name them now.",
    q: "What's the hardest part of planting for you to think about?",
    probes: ["Is there a fear you haven't said out loud yet?"],
    look: "Fears named, peace that's real, and questions asked.",
    plan: "Write down your three biggest fears about planting. Share them with your spouse and a planting spouse who's a few years ahead.",
    items: [
      { id: "sr1", t: "I'm at peace with the financial risk." },
      { id: "sr2", t: "I'm ready for the change this will bring to our family." },
      { id: "sr3", t: "I understand what a planter's schedule is like in the first two years." },
      { id: "sr4", t: "There are fears about this I haven't shared with anyone.", rev: true },
    ],
  },
};

// Spouse rates the planter (spouse as an observer). Maps to planter scales.
export const SPOUSE_SEES = [
  { id: "ob_call", scale: "call", t: "Has a clear sense of God's call to plant." },
  { id: "ob_control", scale: "control", t: "Stays calm and kind under pressure at home." },
  { id: "ob_rhythms", scale: "rhythms", t: "Lives at a pace our family can sustain." },
  { id: "ob_family", scale: "family", t: "Protects our family from ministry taking over." },
  { id: "ob_humility", scale: "humility", t: "Receives correction from me well." },
  { id: "ob_vision", scale: "vision", t: "Casts vision that makes people want to follow." },
  { id: "ob_unchurched", scale: "unchurched", t: "Builds real friendships with people far from God." },
  { id: "ob_systems", scale: "systems", t: "Follows through on details or makes sure someone does." },
];

// ---------- COUPLE ALIGNMENT ----------
export const COUPLE_AREAS = [
  { id: "calling", name: "Calling", items: [
    { id: "cp1", t: "We are both called to plant, not just one of us.", guess: true },
    { id: "cp2", t: "We are both willing to make the sacrifices planting will require." },
    { id: "cp3", t: "We agree on when to launch." } ] },
  { id: "vision", name: "Vision", items: [
    { id: "cv1", t: "We describe the church we're planting the same way.", guess: true },
    { id: "cv2", t: "We agree on who we're trying to reach." },
    { id: "cv3", t: "We are both excited about the city we're going to." } ] },
  { id: "money", name: "Money", items: [
    { id: "cmo1", t: "We agree on how much financial risk is okay for our family." },
    { id: "cmo2", t: "We are at peace with our income and fundraising plan.", guess: true },
    { id: "cmo3", t: "Money is a regular source of tension between us.", rev: true } ] },
  { id: "roles", name: "Roles", items: [
    { id: "cr1", t: "We've clearly talked through what the spouse's role in the church will and won't be.", guess: true },
    { id: "cr2", t: "We agree on how home responsibilities will be shared while planting." },
    { id: "cr3", t: "One of us expects more from the other in ministry than has been said out loud.", rev: true } ] },
  { id: "time", name: "Time & Rhythms", items: [
    { id: "ct1", t: "We agree on how many evenings a week ministry can take.", guess: true },
    { id: "ct2", t: "We have a weekly day off we both protect." },
    { id: "ct3", t: "We agree on how often our home will be open to the church." } ] },
  { id: "home", name: "Home & Kids", items: [
    { id: "ck1", t: "We agree on how involved our kids will be in the plant (or would be, if we have kids).", guess: true },
    { id: "ck2", t: "We've talked about how planting will affect each person in our family." },
    { id: "ck3", t: "Our home is a place of rest for our family right now." } ] },
  { id: "conflict", name: "Conflict", items: [
    { id: "cc1", t: "We resolve disagreements without lingering resentment." },
    { id: "cc2", t: "We can both bring up hard topics without fear.", guess: true },
    { id: "cc3", t: "One of us usually gives in just to keep the peace.", rev: true } ] },
  { id: "support", name: "Support", items: [
    { id: "cs1", t: "We have friends outside the church who support us." },
    { id: "cs2", t: "We have a mentor couple or counselor we can call." },
    { id: "cs3", t: "Our extended families support this decision.", guess: true } ] },
];

// ---------- WIRING (bipolar, 1 = left, 5 = right) ----------
export const WIRING = [
  { id: "pace", left: "Steady", right: "Driving", leftDesc: "Patient, consistent, finishes one thing at a time.", rightDesc: "Fast-paced, restless with slow processes, loves variety.", items: [
    ["I like a steady, predictable pace.", "I like a fast pace with a lot going on."],
    ["I finish one thing before starting the next.", "I juggle many projects at once."],
    ["I'm patient with long processes.", "I get restless when things move slowly."],
    ["I prefer routine.", "I prefer variety."] ] },
  { id: "people", left: "Reflective", right: "Social", leftDesc: "Recharges alone, thinks before speaking, prefers depth.", rightDesc: "Recharges with people, thinks out loud, works the room.", items: [
    ["I recharge alone.", "I recharge with people."],
    ["I think before I speak.", "I think out loud."],
    ["I prefer a few deep conversations.", "I enjoy working a room."],
    ["Meeting new people takes energy.", "Meeting new people gives me energy."] ] },
  { id: "drive", left: "Collaborative", right: "Independent", leftDesc: "Builds consensus, supports the team's direction.", rightDesc: "Makes the call, pushes their direction, challenges the status quo.", items: [
    ["I look for consensus.", "I make the call and move."],
    ["I adapt to the group's direction.", "I push for my direction."],
    ["I avoid stepping on toes.", "I challenge the way things are done."],
    ["I'd rather support a leader.", "I'd rather be the leader."] ] },
  { id: "structure", left: "Flexible", right: "Precise", leftDesc: "Improvises, bends rules, delegates details.", rightDesc: "Plans the details, follows the process, wants it exactly right.", items: [
    ["I improvise.", "I plan the details."],
    ["Rules are guidelines.", "Rules are there for a reason."],
    ["Good enough is often good enough.", "I want it done exactly right."],
    ["I hand details to others.", "I handle details myself."] ] },
  { id: "decide", left: "Intuitive", right: "Analytical", leftDesc: "Trusts the gut, reads people, sees the big picture.", rightDesc: "Trusts the data, weighs the facts, works the specifics.", items: [
    ["I go with my gut.", "I go with the data."],
    ["I decide quickly with little information.", "I gather information before deciding."],
    ["I read people's feelings.", "I weigh the facts."],
    ["I think big picture.", "I think in specifics."] ] },
];

// ---------- SPIRITUAL GIFTS (3 items each, "how true of me") ----------
export const GIFTS = [
  { id: "administration", name: "Administration", ref: "1 Cor 12:28", items: ["I bring order to plans so people know who does what and when.", "Others rely on me to organize events and projects.", "I enjoy turning a big goal into steps and systems."] },
  { id: "apostleship", name: "Apostleship", ref: "Eph 4:11", items: ["I'm drawn to start new ministries where nothing exists.", "I'm energized by pioneering work across cultures or places.", "Others follow me into new territory for the gospel."] },
  { id: "craftsmanship", name: "Craftsmanship", ref: "Ex 31:3-5", items: ["I serve God by building, designing or making things with my hands.", "People ask me to create or fix things for ministry.", "Creative or practical work is how I most naturally serve."] },
  { id: "discernment", name: "Discernment", ref: "1 Cor 12:10", items: ["I can sense when something isn't right spiritually, even before I can explain it.", "I can usually tell whether teaching or motives line up with God's truth.", "Others ask me to help them see what's really going on."] },
  { id: "evangelism", name: "Evangelism", ref: "Eph 4:11", items: ["I look for chances to talk with people about Jesus.", "People have come to faith through my conversations with them.", "Sharing the gospel energizes me more than it scares me."] },
  { id: "exhortation", name: "Exhortation", ref: "Rom 12:8", items: ["People tell me my words encouraged them to keep going.", "I'm drawn to people who are discouraged and want to spur them on.", "I can challenge people to grow in a way that motivates rather than discourages them."] },
  { id: "faith", name: "Faith", ref: "1 Cor 12:9", items: ["I trust God for big things when others think it's impossible.", "My confidence in God has helped others take steps of faith.", "I find it natural to pray boldly for specific outcomes."] },
  { id: "giving", name: "Giving", ref: "Rom 12:8", items: ["I give generously and joyfully beyond what's expected.", "I look for ways to use my resources to meet needs in God's kingdom.", "I'd rather fund a need than have the credit for it."] },
  { id: "healing", name: "Healing", ref: "1 Cor 12:9", items: ["I've prayed for people and seen God heal them.", "I'm moved to pray for healing when I see someone sick or hurting.", "Others ask me specifically to pray for healing."] },
  { id: "helps", name: "Helps", ref: "1 Cor 12:28", items: ["I'm happiest serving behind the scenes so others can do their part.", "I notice practical needs and meet them without being asked.", "I'd rather help a leader succeed than lead myself."] },
  { id: "hospitality", name: "Hospitality", ref: "1 Pet 4:9", items: ["I love opening my home to people, including strangers.", "People feel at home and welcome around me.", "I go out of my way to make newcomers feel they belong."] },
  { id: "intercession", name: "Intercession", ref: "Col 1:9", items: ["I pray for others for long stretches and enjoy it.", "I keep a list of people and needs I pray over faithfully.", "I've often seen clear answers to my prayers for others."] },
  { id: "interpretation", name: "Interpretation", ref: "1 Cor 12:10", items: ["When someone speaks in tongues, I've sensed God giving me the meaning.", "God has used me to bring understanding to a message in tongues.", "Others have confirmed that what I interpreted built up the church."] },
  { id: "knowledge", name: "Knowledge", ref: "1 Cor 12:8", items: ["I love digging deeply into Scripture to understand it.", "People come to me to understand what the Bible teaches.", "I gather and organize what Scripture teaches so others can understand it."] },
  { id: "leadership", name: "Leadership", ref: "Rom 12:8", items: ["People follow my lead without my needing a title.", "I can set direction and move a group toward it.", "I take charge naturally when no one else does."] },
  { id: "mercy", name: "Mercy", ref: "Rom 12:8", items: ["I'm deeply moved by people who are suffering and want to help.", "I'm drawn to the hurting, the sick and the overlooked.", "People in pain tell me they feel safe and understood with me."] },
  { id: "miracles", name: "Miracles", ref: "1 Cor 12:10", items: ["I've seen God do the supernaturally impossible in answer to my prayer.", "I expect God to act in power, and I pray that way.", "God has used me in ways that could only be explained as His intervention."] },
  { id: "prophecy", name: "Prophecy", ref: "Rom 12:6", items: ["I feel compelled to speak God's truth clearly, even when it's unpopular.", "I often sense what God wants to say to a person or a church right now.", "Others say God spoke to them through something I shared."] },
  { id: "shepherding", name: "Shepherding", ref: "Eph 4:11", items: ["I like caring for a group of people over the long haul.", "I notice when someone in my care is drifting and go after them.", "People come to me for spiritual guidance and care."] },
  { id: "teaching", name: "Teaching", ref: "Rom 12:7", items: ["I can explain Scripture so people understand and apply it.", "I enjoy preparing to teach.", "People tell me they learn well from me."] },
  { id: "tongues", name: "Tongues", ref: "1 Cor 12:10", items: ["I pray in a language I haven't learned, as the Spirit enables.", "Praying in tongues is part of my private devotional life.", "God has used a message in tongues through me to build up the church (with interpretation)."] },
  { id: "wisdom", name: "Wisdom", ref: "1 Cor 12:8", items: ["People come to me for advice on hard decisions.", "I can see how to apply God's truth to a messy situation.", "My counsel has helped people avoid mistakes."] },
];
export const SIGN_GIFTS = ["healing", "interpretation", "miracles", "tongues"];
export const GIFT_SCALE = ["Not like me", "A little", "Somewhat", "Mostly", "Very much like me"];

// ---------- FIVEFOLD (forced choice: most / least like me) ----------
export const FIVEFOLD = [
  { id: "A", name: "Apostolic", short: "Pioneer", desc: "Starts new things, extends the mission, builds for multiplication." },
  { id: "P", name: "Prophetic", short: "Guardian", desc: "Calls people back to God's heart, faithfulness and justice." },
  { id: "E", name: "Evangelistic", short: "Recruiter", desc: "Shares the good news, recruits, connects outsiders to Jesus." },
  { id: "S", name: "Shepherding", short: "Caretaker", desc: "Cares, protects, builds community and heals." },
  { id: "T", name: "Teaching", short: "Explainer", desc: "Explains the Scriptures, makes truth understandable, trains." },
];
export const FIVEFOLD_BLOCKS = [
  { A: "Launching something new", P: "Calling people back to what matters", E: "Meeting people far from God", S: "Caring for people who are hurting", T: "Explaining what the Bible means" },
  { A: "Thinking about the next city or ministry", P: "Noticing when we've drifted from our values", E: "Inviting a friend to church", S: "Following up when someone goes missing", T: "Writing a clear study guide" },
  { A: "Building systems that multiply", P: "Speaking hard truth in love", E: "Telling my faith story", S: "Hosting a group in my home", T: "Answering tough Bible questions" },
  { A: "Taking a risky first step", P: "Praying about justice and holiness", E: "Making the gospel simple", S: "Making sure no one falls through the cracks", T: "Training people in sound doctrine" },
  { A: "Seeing the big picture of God's mission", P: "Discerning what God is saying to us now", E: "Starting conversations with strangers", S: "Building deep, lasting community", T: "Helping people understand and apply Scripture" },
  { A: "Pioneering where no church exists", P: "Challenging comfort and complacency", E: "Celebrating every new believer", S: "Walking with someone through grief", T: "Teaching a class" },
  { A: "Sending people out to start things", P: "Guarding the church's faithfulness", E: "Connecting outsiders with the church", S: "Noticing how people are really doing", T: "Studying deeply before I teach" },
  { A: "Dreaming about what doesn't exist yet", P: "Leading people into honest repentance", E: "Recruiting people to the mission", S: "Creating a safe place for people", T: "Bringing clarity when people are confused" },
];

// ---------- SCENARIOS (pick best + worst). key: 1 (poor) .. 4 (best) ----------
export const SCENARIOS = [
  { id: "sj1", title: "The pushback", text: "In a launch team meeting, your most generous volunteer pushes hard for a direction that cuts against the vision. Others start nodding.", options: [
    { t: "Correct them firmly right there so the team hears the vision clearly.", k: 2 },
    { t: "Thank them for caring, keep the meeting on track, then meet one-on-one this week to listen and restate the vision.", k: 4 },
    { t: "Let it go. You can't afford to lose a key giver this early.", k: 1 },
    { t: "Send the team an email clarifying the vision without naming anyone.", k: 2 } ] },
  { id: "sj2", title: "The shortfall", text: "Six months in, giving is 30% below budget. You can cover payroll for two more months.", options: [
    { t: "Quietly cut your own salary and keep going.", k: 2 },
    { t: "Tell your sending church, network and key leaders now, build a revised plan together, and make a clear ask.", k: 4 },
    { t: "Make an emergency appeal from the stage this Sunday.", k: 2 },
    { t: "Wait a month to see if it turns around.", k: 1 } ] },
  { id: "sj3", married: true, title: "Running on empty", text: "Your spouse tells you they're exhausted and feel the church gets the best of you.", options: [
    { t: "Reassure them it's just a season until launch.", k: 1 },
    { t: "Listen fully, ask what would help, and change your calendar this week together.", k: 4 },
    { t: "Ask a couple from the team to help with meals and childcare.", k: 3 },
    { t: "Suggest they step back from their ministry roles for a while.", k: 2 } ] },
  { id: "sj4", title: "The confession", text: "A key leader confides that he has been struggling with pornography for months.", options: [
    { t: "Thank him for being honest, keep it between the two of you, and ask him to keep you posted.", k: 1 },
    { t: "Thank him, walk with him toward repentance, bring in real accountability, and step him back from leadership for a season under a clear restoration plan.", k: 4 },
    { t: "Remove him from leadership immediately and tell the team why.", k: 1 },
    { t: "Refer him to a counselor and let the counselor handle it.", k: 2 } ] },
  { id: "sj5", title: "The new neighbor", text: "A large, well-funded church announces a new campus three blocks from your launch site.", options: [
    { t: "Reach out to their pastor, learn their heart for the city, and look for ways to partner.", k: 4 },
    { t: "Move your launch date up to get there first.", k: 1 },
    { t: "Ignore it and stay focused on your plan.", k: 3 },
    { t: "Tell your team why your church will be different and better.", k: 2 } ] },
  { id: "sj6", title: "The faithful volunteer", text: "Your most faithful volunteer is leading kids check-in poorly, and parents are starting to complain.", options: [
    { t: "Take it over yourself so it gets done right.", k: 1 },
    { t: "Have an honest conversation, clarify what a win looks like, offer training, and set a time to evaluate together.", k: 4 },
    { t: "Quietly recruit someone else to take over.", k: 1 },
    { t: "Talk it through with them and move them to a role that fits their strengths.", k: 3 } ] },
  { id: "sj7", title: "The plateau", text: "Eight months after launch, attendance has plateaued at 60. Your coach says your approach isn't reaching new people.", options: [
    { t: "Hold the course. Growth takes time and you trust the strategy.", k: 1 },
    { t: "Ask your team and recent guests what's working, test one change at a time, and measure it.", k: 4 },
    { t: "Add more programs to give people more reasons to come.", k: 2 },
    { t: "Double the marketing budget.", k: 2 } ] },
  { id: "sj8", title: "The founding family", text: "A couple who helped found the church tells you they're leaving because 'it's not what it used to be.'", options: [
    { t: "Work hard to convince them to stay.", k: 2 },
    { t: "Bless them, ask honest questions to learn from them, and leave the door open.", k: 4 },
    { t: "Ask them to leave quietly so it doesn't unsettle anyone.", k: 1 },
    { t: "Take it personally and keep your distance.", k: 1 } ] },
];

// ---------- VALIDITY ----------
// idealized: "agree" means agreeing (4-5) is idealized; "disagree" means disagreeing (1-2) is idealized.
export const CANDOR = [
  { id: "cd1", t: "I have never felt jealous of another pastor's success.", idealized: "agree" },
  { id: "cd2", t: "I have never been impatient with someone I love.", idealized: "agree" },
  { id: "cd3", t: "There are times I care more about how I look than about being faithful.", idealized: "disagree" },
  { id: "cd4", t: "I have never lost my temper.", idealized: "agree" },
  { id: "cd5", t: "I sometimes compare my ministry to other people's.", idealized: "disagree" },
  { id: "cd6", t: "I always practice what I preach.", idealized: "agree" },
];
export const BOGUS = [
  { id: "bg1", t: "I have personally met every person who lives in my city.", flag: "agree" },
  { id: "bg2", t: "I have never once been late to anything in my life.", flag: "agree" },
];
// pairs of an item and its reverse-keyed partner; after reversing, answers should be close.
export const CONSISTENCY_PAIRS = [["cf1", "cf2"], ["s2", "s3"], ["$1", "$4"], ["e2", "e3"], ["u1", "u3"]];

// ---------- SAFETY (spouse; leader-only; never in couple report) ----------
export const SAFETY = [
  { id: "sf1", t: "I feel safe at home.", concernIf: "low" },
  { id: "sf2", t: "I can disagree with my spouse without being afraid of how they'll react.", concernIf: "low" },
  { id: "sf3", t: "I have sometimes felt afraid of my spouse.", concernIf: "high" },
];

// ---------- BELIEFS (Parker's core beliefs, the same ones Pastor To Pastor asks pastors to share) ----------
export const BELIEFS = [
  { id: "b2", t: "I affirm the Nicene Creed." },
  { id: "b1", t: "The Bible is God's Word: true, without error, and the final authority for faith and life." },
  { id: "b3", t: "Salvation is by grace through faith in Jesus alone." },
  { id: "b5", t: "Marriage is one man and one woman for a lifetime, and I am not LGBTQ affirming." },
  { id: "b6", t: "I am pro-life, from conception to natural death." },
];
// Held with open hands: not a test for any planter.
export const OPEN_HANDS = ["Women in pastoral leadership", "Baptism", "Tongues and the spiritual gifts", "Calvinism and Arminianism", "End times"];

// ---------- READINESS FACTS (planter) ----------
// pts: contribution to the Experience & Readiness score (0-4). flag: concern level when chosen.
export const FACTS = [
  { id: "edu", q: "Highest education", opts: [
    { t: "High school", pts: 1 }, { t: "Some college", pts: 1 }, { t: "Bachelor's degree", pts: 2 },
    { t: "Bachelor's in Bible or ministry", pts: 3 }, { t: "Some seminary", pts: 3 }, { t: "Master's (MDiv, MA or similar)", pts: 4 }, { t: "Doctorate", pts: 4 } ] },
  { id: "years", q: "Years in vocational ministry (paid or significant volunteer leadership)", opts: [
    { t: "Less than 1", pts: 0 }, { t: "1–2", pts: 1 }, { t: "3–5", pts: 2 }, { t: "6–10", pts: 3 }, { t: "More than 10", pts: 4 } ] },
  { id: "role", q: "Highest role you've held", opts: [
    { t: "Volunteer leader", pts: 1 }, { t: "Ministry staff", pts: 2 }, { t: "Ministry director", pts: 2 },
    { t: "Associate or executive pastor", pts: 3 }, { t: "Lead pastor", pts: 4 }, { t: "I've planted before", pts: 4 } ] },
  { id: "teamsize", q: "Largest group you've personally led", opts: [
    { t: "Fewer than 10", pts: 0 }, { t: "10–25", pts: 1 }, { t: "26–75", pts: 2 }, { t: "76–200", pts: 3 }, { t: "More than 200", pts: 4 } ] },
  { id: "led", q: "People you've personally led to faith in the last 12 months", opts: [
    { t: "None", pts: 0, flag: "watch", ft: "No one personally led to faith in the past year" }, { t: "1–2", pts: 2 }, { t: "3–5", pts: 3 }, { t: "6 or more", pts: 4 } ] },
  { id: "raised", q: "Most money you've raised for ministry", opts: [
    { t: "I haven't raised money", pts: 0 }, { t: "Under $10,000", pts: 1 }, { t: "$10,000–$50,000", pts: 2 }, { t: "$50,000–$150,000", pts: 3 }, { t: "More than $150,000", pts: 4 } ] },
  { id: "training", q: "Church planting training completed", multi: true, opts: [
    { t: "A planting residency or internship", pts: 2 }, { t: "A planting boot camp or course", pts: 1 }, { t: "Served on a church plant's launch team", pts: 1 }, { t: "Evangelism training", pts: 1 }, { t: "None yet", pts: 0, none: true } ] },
  { id: "coach", q: "Do you have a coach for planting?", opts: [
    { t: "Yes, meeting regularly", pts: 4 }, { t: "Identified, not started", pts: 2 }, { t: "Not yet", pts: 0, flag: "watch", ft: "No planting coach yet" } ] },
  { id: "peers", q: "Are you in a regular peer group with other planters or pastors?", opts: [
    { t: "Yes, at least monthly", pts: 4 }, { t: "Occasionally", pts: 2 }, { t: "Not yet", pts: 0, flag: "watch", ft: "No peer group yet" } ] },
  { id: "sending", q: "Do you have a sending or partner church?", opts: [
    { t: "Yes, committed", pts: 4 }, { t: "In conversation", pts: 2 }, { t: "Not yet", pts: 0 } ] },
  { id: "core", q: "People committed to your core team today", opts: [
    { t: "None yet", pts: 0 }, { t: "1–10", pts: 1 }, { t: "11–25", pts: 2 }, { t: "26–50", pts: 3 }, { t: "More than 50", pts: 4 } ] },
  { id: "debt", q: "Household debt, not counting a mortgage", opts: [
    { t: "None", pts: 4 }, { t: "Some, and it's manageable", pts: 3 }, { t: "Heavy, and it's a real pressure", pts: 0, flag: "concern", ft: "Heavy household debt" } ] },
  { id: "funding", q: "Your funding plan for the first two years", opts: [
    { t: "Fully funded salary", pts: 4 }, { t: "Bivocational by choice", pts: 3 }, { t: "Bivocational because we have to", pts: 2 }, { t: "Not sure yet", pts: 0, flag: "watch", ft: "Funding plan not settled" } ] },
  { id: "launch", q: "When do you hope to launch public services?", opts: [
    { t: "Within 6 months", pts: 0, info: true }, { t: "6–12 months", pts: 0, info: true }, { t: "12–24 months", pts: 0, info: true }, { t: "Not sure yet", pts: 0, info: true } ] },
];

// ---------- REFERENCES (360) ----------
export const REF_RELATIONSHIPS = ["Sending or supervising pastor", "Ministry peer", "Someone they've led", "Friend outside the church", "Family member"];
export const REF_ITEMS = [
  { id: "rf_call", scale: "call", t: "Has a clear, compelling sense of calling to plant." },
  { id: "rf_devotion", scale: "devotion", t: "Walks closely with God, and it shows in how they live." },
  { id: "rf_integrity", scale: "integrity", t: "Is trustworthy. Their word is good." },
  { id: "rf_humility", scale: "humility", t: "Receives correction well." },
  { id: "rf_control", scale: "control", t: "Stays calm and kind under pressure." },
  { id: "rf_resilience", scale: "resilience", t: "Bounces back from setbacks." },
  { id: "rf_rhythms", scale: "rhythms", t: "Lives at a sustainable pace." },
  { id: "rf_partnership", scale: "partnership", t: "Has a healthy, strong marriage (if you've seen it up close).", married: true },
  { id: "rf_family", scale: "family", t: "Puts their family ahead of ministry demands.", married: true },
  { id: "rf_vision", scale: "vision", t: "Casts vision people want to follow." },
  { id: "rf_team", scale: "team", t: "Builds teams where people feel like owners." },
  { id: "rf_develop", scale: "develop", t: "Develops other leaders." },
  { id: "rf_conflict", scale: "conflict", t: "Handles conflict directly and with grace." },
  { id: "rf_unchurched", scale: "unchurched", t: "Builds real friendships with people far from God." },
  { id: "rf_evangelism", scale: "evangelism", t: "Shares the gospel regularly and clearly." },
  { id: "rf_disciple", scale: "disciple", t: "Makes disciples who go on to disciple others." },
  { id: "rf_context", scale: "context", t: "Understands and adapts to the community they serve." },
  { id: "rf_drive", scale: "drive", t: "Gets things done without being pushed." },
  { id: "rf_adapt", scale: "adapt", t: "Adapts quickly when plans change." },
  { id: "rf_money", scale: "money", t: "Handles money wisely and can ask others to give." },
  { id: "rf_comms", scale: "comms", t: "Communicates God's Word clearly and compellingly." },
  { id: "rf_systems", scale: "systems", t: "Follows through on details, or makes sure someone does." },
];
export const FOLLOW_TEST = "If they planted a church in your city, how likely would you be to join the launch team?";
export const FOLLOW_SCALE = ["Not likely", "Unlikely", "Maybe", "Likely", "I'd be the first one there"];
export const REF_READY = ["Ready now", "Ready within a year", "Not yet", "I'm not sure"];

// ---------- OTHER ASSESSMENTS (optional; results people already have) ----------
// Plumbline never asks these tools' questions. People type in, or upload, results they already have,
// and the leader report sets them beside Wiring. Names belong to their owners.
export const OTHER = {
  disc: { name: "DISC", styles: [["D", "Dominance"], ["I", "Influence"], ["S", "Steadiness"], ["C", "Conscientiousness"]] },
  mbti: { name: "Myers-Briggs (MBTI) or 16Personalities", types: ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP", "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"] },
  strengths: { name: "CliftonStrengths (StrengthsFinder)", hint: "Your top five, separated by commas" },
  ennea: { name: "Enneagram", types: ["1 Reformer", "2 Helper", "3 Achiever", "4 Individualist", "5 Investigator", "6 Loyalist", "7 Enthusiast", "8 Challenger", "9 Peacemaker"] },
  pi: { name: "Predictive Index", hint: "Your reference profile, like Maverick or Collaborator" },
  when: ["In the last year", "1 to 3 years ago", "More than 3 years ago"],
  maxFiles: 5, maxMb: 5,
};
// How another tool's result is compared with Wiring. Only links with published research or a direct definitional match.
export const OTHER_LINKS = [
  { tool: "disc", match: "D", track: "drive", side: "right", basis: "DISC's D (Dominance) describes someone direct who takes charge, the Independent end of Drive." },
  { tool: "disc", match: "I", track: "people", side: "right", basis: "DISC's I (Influence) describes someone outgoing and people-energized, the Social end of People." },
  { tool: "disc", match: "S", track: "pace", side: "left", basis: "DISC's S (Steadiness) describes a patient, consistent pace, the Steady end of Pace." },
  { tool: "disc", match: "C", track: "structure", side: "right", basis: "DISC's C (Conscientiousness) describes careful, detail-minded work, the Precise end of Structure." },
  { tool: "mbti", match: "E", pos: 0, track: "people", side: "right", basis: "MBTI's E–I scale lines up closely with extraversion (McCrae & Costa, 1989, Journal of Personality)." },
  { tool: "mbti", match: "I", pos: 0, track: "people", side: "left", basis: "MBTI's E–I scale lines up closely with extraversion (McCrae & Costa, 1989, Journal of Personality)." },
  { tool: "mbti", match: "J", pos: 3, track: "structure", side: "right", basis: "MBTI's J–P scale lines up with conscientiousness (McCrae & Costa, 1989, Journal of Personality)." },
  { tool: "mbti", match: "P", pos: 3, track: "structure", side: "left", basis: "MBTI's J–P scale lines up with conscientiousness (McCrae & Costa, 1989, Journal of Personality)." },
];

// ---------- CONTEXT (optional city fit) ----------
// Asked only if the couple has identified a city. Plumbline doesn't show a city profile; it asks what the planter
// and spouse know and feel about the place. The leader report sets their answers beside public data to check.
export const CONTEXT = {
  choices: [
    { id: "cx_type", q: "What kind of place is it?", opts: ["Urban core", "Suburb", "Small town", "Rural", "College town", "Somewhere else"] },
    { id: "cx_live", q: "Do you live there now?", both: true, opts: ["Yes, for 3 years or more", "Yes, for less than 3 years", "No, but we live within an hour", "No, we'd move there"], flag: [3] },
    { id: "cx_known", q: "How many people there who don't go to church do you know by name?", opts: ["None yet", "1 to 4", "5 to 14", "15 or more"], flag: [0, 1] },
    { id: "cx_church", q: "About what share of people there do you think are in church on a typical weekend?", opts: ["Under 10%", "10 to 20%", "20 to 35%", "Over 35%", "I don't know"], flag: [4] },
    { id: "cx_stay", q: "How long do you plan to stay?", both: true, opts: ["Less than 5 years", "5 to 10 years", "More than 10 years", "The rest of our lives"], flag: [0] },
    { id: "cx_cost", q: "Could your household afford to live there on a planter's pay for the first three years?", opts: ["Yes, comfortably", "Yes, but it would be tight", "Only with a second income or a bivocational job", "I'm not sure yet"], flag: [3] },
  ],
  planter: [
    { id: "cx1", t: "The people who live there are a lot like me in age, education and way of life." },
    { id: "cx2", t: "I've lived in a place like this before." },
    { id: "cx3", t: "I understand what most people there believe about God and the church." },
    { id: "cx4", t: "I can name the city's biggest needs and tensions." },
    { id: "cx5", t: "I enjoy the things people there do for fun." },
    { id: "cx6", t: "I've talked with pastors already serving there about what God is doing." },
    { id: "cx7", t: "I'd still want to plant there if growth came slowly." },
    { id: "cx8", t: "My family would thrive there: schools, friends and distance from relatives.", married: true },
  ],
  spouse: [
    { id: "cxs1", t: "I can picture our family thriving there." },
    { id: "cxs2", t: "I'm excited about this city myself, not just going along." },
    { id: "cxs3", t: "I have friends there, or I can see how I'd make them." },
    { id: "cxs4", t: "The pace and culture of the city suit me." },
    { id: "cxs5", t: "I understand what living there will cost us." },
  ],
  texts: {
    planter: [{ id: "why", q: "Why this city? What has God shown you about it?" }, { id: "who", q: "Who there do you most want to reach?" }],
    spouse: [{ id: "feel", q: "What excites you about this city, and what worries you?" }],
  },
  checkWith: [
    ["U.S. Census QuickFacts", "https://www.census.gov/quickfacts", "Age, education, income, housing cost"],
    ["U.S. Religion Census (ARDA)", "https://www.thearda.com/us-religion/census/congregational-membership", "How many people belong to a congregation, by county"],
  ],
};

// ---------- CHECKOUT (owner, 23 Oct 2026: first couple free, then $99 per couple; code BETA = a third off for life until 5 Jan 2027) ----------
export const CHECKOUT = "https://buy.stripe.com/28EcN51eQd9jb06a6J9R60h";
// ---------- PARTNER (Parker's Stripe links) ----------
export const PARTNER = {
  once: "https://buy.stripe.com/28E7sL4r2d9j5FM6Ux9R600",
  monthly: [["$10", "https://buy.stripe.com/14A4gze1C7OZc4afr39R601"], ["$25", "https://buy.stripe.com/28EdR92iU5GR7NUceR9R602"], ["$50", "https://buy.stripe.com/8x25kD1eQ9X70lsfr39R603"]],
  manage: "https://billing.stripe.com/p/login/28E7sL4r2d9j5FM6Ux9R600",
};
