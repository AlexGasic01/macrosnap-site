/* Agreement content + PDF/HTML renderers. Pure functions; no DOM needed for blocks/PDF. */
(function (root) {
  const DEFAULTS = {
    companyName: "MacroSnap", appName: "MacroSnap", companyEmail: "", companySignatory: "", companyTitle: "",
    creatorName: "", creatorEmail: "", startDate: "",
    currency: "USD", payModel: "view", ratePer1k: "", commissionType: "percent", commissionRate: "", recurringMonths: 0, holdDays: 14, maxViews: "",
    viewWindow: 7, reviewDays: 3, videosPerDay: 3, schedule: "daily", everyN: 4, daysPerWeek: 4, missThreshold: 3, liveDays: 3650, leaveDays: 7,
    minPayout: 50, requestDays: "Any day", requestsPerWeek: 1, processingDays: 3, weeklyCap: "", payoutMethod: "PayPal",
    exclusive: "", minTerm: 30, timezone: "UTC", law: "", pageSize: "A4", theme: "dark",
  };

  const num = (x) => {
    const n = Number(String(x).replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const fmtNum = (x) => { const n = num(x); return n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); };
  const ph = (x, label) => (String(x ?? "").trim() ? String(x).trim() : "[" + label + "]");
  const money = (s, x, label) => (String(x ?? "").trim() === "" || isNaN(num(x)) ? "[" + label + "]" : s.currency + " " + fmtNum(x));
  const plural = (n, one, many) => (Number(n) === 1 ? one : many);
  const fmtDate = (d) => {
    if (!d) return "[Start Date]";
    const dt = new Date(d + "T00:00:00Z");
    if (isNaN(dt)) return "[Start Date]";
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  };

  /* ---------- content ---------- */
  function buildBlocks(input) {
    const s = Object.assign({}, DEFAULTS, input || {});
    if (s.payModel === "video") s.payModel = "affiliate";
    const view = s.payModel === "view" || s.payModel === "hybrid";
    const aff = s.payModel === "affiliate" || s.payModel === "hybrid";
    const co = ph(s.companyName, "Company name");
    const app = ph(s.appName, "App name");
    const creator = ph(s.creatorName, "Creator name");
    const law = ph(s.law, "JURISDICTION");
    const rate1k = money(s, s.ratePer1k, "rate per 1,000 views");
    const commission = s.commissionType === "fixed"
      ? money(s, s.commissionRate, "commission amount") + " per Qualifying Purchase"
      : (String(s.commissionRate).trim() === "" || isNaN(num(s.commissionRate)) ? "[commission %]" : fmtNum(s.commissionRate) + "%") + " of Net Revenue from each Qualifying Purchase";
    const recM = Math.max(0, parseInt(s.recurringMonths, 10) || 0);
    const recurText = recM === 0 ? "the first payment of each subscription or purchase only" : `each payment made in the first ${recM} ${plural(recM, "month", "months")} of each subscription`;
    const hold = Math.max(0, parseInt(s.holdDays, 10) || 0);
    const cap = money(s, s.weeklyCap, "weekly cap");
    const minP = money(s, s.minPayout, "minimum payout");
    const maxV = String(s.maxViews).trim() !== "" && !isNaN(num(s.maxViews)) ? fmtNum(s.maxViews) : "";
    const modelLabel = { view: "Per view", affiliate: "Affiliate (Creator Code commission)", hybrid: "Hybrid (per view and affiliate)" }[s.payModel];
    const ord = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
    const interval = s.schedule === "every2" ? 2 : s.schedule === "every3" ? 3 : s.schedule === "everyN" ? Math.max(2, parseInt(s.everyN, 10) || 2) : 1;
    const perWeek = s.schedule === "perWeek";
    const dpw = Math.min(7, Math.max(1, parseInt(s.daysPerWeek, 10) || 1));
    const scheduleText = perWeek ? `${dpw} ${plural(dpw, "day", "days")} per Payout Week, chosen by the Creator`
      : interval === 1 ? "Every day" : `Every ${ord(interval)} day, counted from the Start Date`;
    const miss = Math.max(1, parseInt(s.missThreshold, 10) || 3);
    const ld = Math.max(0, parseInt(s.liveDays, 10) || 0);
    const liveText = ld >= 365 && ld % 365 === 0 ? `${ld / 365} ${plural(ld / 365, "year", "years")} (${fmtNum(ld)} days)` : `${fmtNum(ld)} ${plural(ld, "day", "days")}`;
    const B = [];

    B.push({ t: "title", text: "Creator Agreement" });
    B.push({ t: "sub", text: app + " creator programme" });
    B.push({ t: "p", text: `This Agreement is between **${co}** (**"Company"**) and **${creator}** (**"Creator"**), and starts on ${fmtDate(s.startDate)} (the **"Start Date"**).` });

    B.push({ t: "h", text: "1. Definitions" });
    const defs = [
      "**Agreement**: this document, including Schedule A.",
      `**App**: the product or brand the Creator makes content for, as named in Schedule A, which is ${app}.`,
      "**Content**: any video, caption, audio, image or other material the Creator produces under this Agreement.",
      `**Pay model**: how Earnings are calculated for the Creator (${s.payModel === "view" ? "per view" : s.payModel === "affiliate" ? "affiliate commission" : "per view and affiliate commission"}), as set in Schedule A.`,
      "**Creator Code**: the unique code Company issues to the Creator through the Creator Dashboard under clause 3.8.",
    ];
    if (view) {
      defs.push("**Qualifying View**: a view that counts under clause 4.2.");
      defs.push("**View Counting Window**: the number of days after a video is posted during which its views count, as set in Schedule A.");
    }
    if (aff) {
      defs.push("**Qualifying Purchase**: a purchase of the App that meets clause 4.6.");
      defs.push("**Net Revenue**: the amount Company actually receives for a purchase, after app store and payment processor fees, taxes, discounts, refunds and chargebacks.");
      defs.push("**Commission Hold Period**: the number of days after a Qualifying Purchase before its commission clears, as set in Schedule A.");
    }
    defs.push(
      "**Posting Day**: a day on which the Creator must post, under the posting schedule in Schedule A.",
      "**Posting Quota**: the number of videos the Creator must post on each Posting Day, as set in Schedule A.",
      "**Earnings**: the amounts the Creator has earned under clause 4, as shown in the Creator Dashboard.",
      "**Creator Dashboard**: the online panel where the Creator views Content status, Earnings and payout requests.",
      "**Payout Request**: a request by the Creator to be paid some or all of their Available Balance, made through the Creator Dashboard or by message to Company's creator team under clause 5.1.",
      `**Available Balance**: Earnings that have cleared the ${view && aff ? "Review Period or Commission Hold Period" : view ? "Review Period" : "Commission Hold Period"} and have not yet been paid or held.`,
      "**Weekly Payout Cap**: the maximum total amount Company will pay the Creator in one Payout Week, as set in Schedule A.",
      `**Payout Week**: Monday 00:00 to Sunday 23:59, ${ph(s.timezone, "time zone")}.`,
    );
    if (view) defs.push("**Review Period**: the number of days after the View Counting Window ends that Company has to verify Content and views before Earnings clear, as set in Schedule A.");
    defs.forEach((d) => B.push({ t: "b", text: d }));

    B.push({ t: "h", text: "Schedule A: Creator terms" });
    B.push({ t: "p", text: "The terms below apply to this Creator. The clauses of this Agreement refer to them by name." });
    const rows = [["Term", "Value", "Used in"]];
    rows.push(["Creator", creator + (s.creatorEmail.trim() ? ", " + s.creatorEmail.trim() : ""), "Whole Agreement"]);
    rows.push(["Start Date", fmtDate(s.startDate), "Clause 8"]);
    rows.push(["App", app, "Clause 3"]);
    rows.push(["Pay model", modelLabel, "Clause 4.1"]);
    if (view) rows.push(["Rate per 1,000 Qualifying Views", rate1k, "Clause 4.1"]);
    rows.push(["Creator Code", "Unique code issued in the Creator Dashboard", "Clauses 3.8, 4.5"]);
    if (aff) rows.push(["Affiliate commission", commission, "Clause 4.6"]);
    if (aff) rows.push(["Commission applies to", recurText.charAt(0).toUpperCase() + recurText.slice(1), "Clause 4.6"]);
    if (aff) rows.push(["Commission Hold Period", `${hold} ${plural(hold, "day", "days")} after purchase`, "Clause 4.6"]);
    if (view) rows.push(["Maximum payable views per video", maxV || "No limit", "Clause 4.1"]);
    if (view) rows.push(["View Counting Window", `${s.viewWindow} ${plural(s.viewWindow, "day", "days")} after posting`, "Clause 4.2"]);
    if (view) rows.push(["Review Period", `${s.reviewDays} ${plural(s.reviewDays, "day", "days")} after the View Counting Window ends`, "Clause 4.2"]);
    rows.push(["Posting schedule", scheduleText, "Clause 3.1"]);
    rows.push(["Posting Quota", `${s.videosPerDay} ${plural(s.videosPerDay, "video", "videos")} per Posting Day`, "Clause 3.1"]);
    rows.push(["Minimum payout", minP, "Clause 5"]);
    rows.push(["When Payout Requests can be made", `${ph(s.requestDays, "days")}, up to ${s.requestsPerWeek} ${plural(s.requestsPerWeek, "request", "requests")} per Payout Week`, "Clause 5"]);
    rows.push(["Payout processing time", `Within ${s.processingDays} business ${plural(s.processingDays, "day", "days")} of approval`, "Clause 5"]);
    rows.push(["Weekly Payout Cap", cap + " per Payout Week", "Clause 5"]);
    rows.push(["How to request a payout", "Creator Dashboard, or message to the MacroSnap creator team".replace("MacroSnap", app), "Clause 5.1"]);
    rows.push(["Payout method", ph(s.payoutMethod, "payout method"), "Clause 5"]);
    rows.push(["Exclusivity", s.exclusive.trim() ? `Exclusive to Company in the ${s.exclusive.trim()} category` : "None", "Clause 6"]);
    rows.push(["Minimum term", `${s.minTerm} ${plural(s.minTerm, "day", "days")}`, "Clause 8"]);
    B.push({ t: "table", widths: [0.34, 0.50, 0.16], rows, hl: -1 });

    B.push({ t: "h", text: "2. Appointment" });
    B.push({ t: "p", text: "2.1 Company appoints the Creator, and the Creator agrees, to produce and post Content promoting the App on the terms of this Agreement." });
    B.push({ t: "p", text: "2.2 This Agreement is non-exclusive unless Schedule A says otherwise." });

    B.push({ t: "h", text: "3. Content requirements" });
    [
      "3.1 **Posting schedule.** " + (perWeek
        ? `In each Payout Week, the Creator must post on at least ${dpw} different ${plural(dpw, "day", "days")}, chosen by the Creator. Each of those days is a Posting Day.`
        : interval === 1 ? "Every day is a Posting Day."
        : `Posting Days fall every ${interval} days, starting on the Start Date (the Start Date, then ${interval} days later, and so on). The Creator may post more often, but only the Posting Days count toward the Posting Quota.`)
        + " On each Posting Day, the Creator must post at least the Posting Quota of videos promoting the App.",
      "3.2 **Changing the schedule.** Company may change the Posting Quota or the posting schedule by giving the Creator at least 7 days' written notice (a message in the Creator Dashboard or email is enough). The new terms replace the ones in Schedule A from the date in the notice. The Creator may end this Agreement under clause 8 instead of accepting a heavier schedule.",
      `3.3 **Counting videos.** A video counts toward the quota only if it: (a) is original and made by the Creator; (b) is posted publicly on the platform and account Company has approved; (c) meets the brief, guidelines and disclosure rules in clause 7; (d) shows or says the Creator Code as required by clause 3.8; and (e) stays live for at least ${liveText}.`,
      "3.4 **Proof of posting.** The Creator must submit the link to each video in the Creator Dashboard within 24 hours of posting.",
      `3.5 **Missed days.** If the Creator posts fewer videos than the Posting Quota on a Posting Day, it is a shortfall for clause 3.6, and ${view ? "view Earnings are paid only for Qualifying Views on videos that count under 3.3" : "no Earnings are lost on Qualifying Purchases already made with the Creator Code"}. Quota shortfalls do not carry over to other days unless Company agrees in writing.`,
      `3.6 **Repeated shortfalls.** If the Creator misses the Posting Quota on ${miss} or more Posting Days in any 30-day period, Company may issue a written warning. If the Creator misses it on ${miss} or more further Posting Days within 30 days after that warning, Company may terminate under clause 8.3.`,
      `3.7 **Approved leave.** The Creator may take up to ${s.leaveDays} days of leave per calendar month, with at least 24 hours' notice through the Creator Dashboard. Approved leave days are not Posting Days, and the Posting Quota does not apply on them.`,
      "3.8 **Creator Code.** Company will issue the Creator a unique Creator Code, which the Creator can view at any time in the Creator Dashboard. The Creator must show or say the Creator Code in each video as the brief requires (for example on screen, in the caption or spoken). The Creator Code belongs to Company, and Company may replace it by issuing a new one in the Creator Dashboard." + (s.payModel === "view"
        ? " This applies even though the Creator is paid per view: the Creator Code is used to track code entries, purchases and conversion rate under clause 4.5, and earns the Creator no commission."
        : " This applies under every Pay model."),
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "4. Earnings" });
    let p41;
    const capSentence = view && maxV ? ` Views above ${maxV} per video earn nothing.` : "";
    if (s.payModel === "view") p41 = `4.1 **Pay model.** Company pays the Creator on a per-view basis: ${rate1k} per 1,000 Qualifying Views, pro rata, for each video that counts under clause 3.3.${capSentence}`;
    else if (s.payModel === "affiliate") p41 = `4.1 **Pay model.** Company pays the Creator on an affiliate basis: ${commission}, as tracked through the Creator Code under clauses 4.5 and 4.6.`;
    else p41 = `4.1 **Pay model.** Company pays the Creator on a hybrid basis: (a) ${rate1k} per 1,000 Qualifying Views, pro rata, for each video that counts under clause 3.3; and (b) ${commission}, as tracked through the Creator Code under clauses 4.5 and 4.6.${capSentence}`;
    B.push({ t: "p", text: p41 });
    B.push({
      t: "p",
      text: view
        ? "4.2 **Qualifying Views and Review Period.** A Qualifying View is a view recorded by the platform's own analytics on a video that counts under clause 3.3, during the View Counting Window, excluding views Company reasonably believes come from bots, purchased traffic, the Creator's own accounts or other manipulation. On request, the Creator must give Company screenshots or read-only access to the video's analytics. When the View Counting Window ends, Company has the Review Period to verify the video and its views. If they meet this Agreement, the Earnings move into the Available Balance when the Review Period ends. If a video does not meet clause 3.3, Company will tell the Creator why in the Creator Dashboard, and the Creator has 48 hours to fix it and resubmit."
        : "4.2 **Video checks.** Company may check any video against clause 3.3. If a video does not meet it, Company will tell the Creator why in the Creator Dashboard, and the Creator has 48 hours to fix it and resubmit.",
    });
    B.push({ t: "p", text: `4.3 **Currency and tax.** All amounts are in ${ph(s.currency, "currency")}. The Creator is responsible for all taxes on their Earnings under the laws that apply to them, including income tax and, where applicable, VAT, GST or similar sales taxes. Company may withhold tax where the law requires it and will tell the Creator what it withheld. The Creator must give Company any tax forms or details Company reasonably needs to pay them. If the Creator must charge VAT, GST or a similar tax, they must provide a valid tax invoice, and amounts in Schedule A are exclusive of that tax.` });
    B.push({ t: "p", text: "4.4 **Changing the rate or Pay model.** Company may change the rates, commission or Pay model by giving 7 days' written notice. Videos posted and Qualifying Purchases made before the change starts are paid on the old terms." });
    B.push({ t: "p", text: "4.5 **Tracking.** Company uses the Creator Code to track: (a) code entries, meaning each time the Creator Code is entered in the App or at checkout; (b) purchases made with the Creator Code; and (c) the Creator's conversion rate, meaning purchases as a share of code entries (and, where available, of views). Company will show these figures in the Creator Dashboard" + (aff ? " and use them to calculate the Creator's affiliate Earnings" : "") + ". Company's tracking records decide these figures, unless they contain an obvious error. The Creator may dispute a figure in writing within 30 days of it appearing in the Creator Dashboard, and Company will review it in good faith." });
    if (aff) B.push({ t: "p", text: `4.6 **Affiliate commission.** A Qualifying Purchase is a paid purchase of the App made with the Creator Code by a genuine customer who is not the Creator, while this Agreement is in force. For each Qualifying Purchase, the Creator earns the commission set in Schedule A, on ${recurText}. Commission clears into the Available Balance when the Commission Hold Period ends. If a purchase is refunded, charged back or cancelled for a refund, the commission on it is reversed, including after it has cleared, under clause 5.5.` });
    B.push({ t: "p", text: (aff ? "4.7" : "4.6") + " **Code misuse.** The Creator must not: (a) use the Creator Code for their own purchases or those of accounts they control; (b) post the Creator Code on coupon, deal or cashback sites; (c) bid on Company's brand names in paid search; or (d) offer cash or other incentives to people to enter the Creator Code without Company's written approval. If the Creator breaches this clause, Company may deactivate the Creator Code and withhold " + (aff ? "commission on the affected purchases" : "Earnings linked to the misuse") + "." });

    B.push({ t: "h", text: "5. Payout requests and the Weekly Payout Cap" });
    [
      "5.1 **How and when the Creator can request a payout.** The Creator may submit a Payout Request either (i) through the Creator Dashboard, or (ii) by written message to a member of Company's creator team through a channel Company provides (such as email or Creator Dashboard chat). A request by message is made when Company's creator team receives it, and Company will confirm receipt in writing. Either way, the Creator may make a Payout Request only when: (a) the Available Balance is at least the minimum payout in Schedule A; (b) the request is made on a day and at a frequency allowed in Schedule A; and (c) the Creator has completed payment details and any identity or tax details Company reasonably needs to pay them.",
      "5.2 **Weekly Payout Cap.** Company will not pay the Creator more than the Weekly Payout Cap in any one Payout Week, however many Payout Requests are made. Any Available Balance above the cap stays in the Creator's account and can be requested in later Payout Weeks, subject to the cap each week. The cap applies to payouts, not to Earnings, so Earnings are never lost because of it.",
      "5.3 **Processing.** Company will approve or decline a Payout Request, and pay approved requests by the payout method in Schedule A, within the processing time in Schedule A. Company may delay a payout while it investigates suspected fraud, fake views or a breach of this Agreement, and will tell the Creator why.",
      "5.4 **Fees.** Company pays its own transfer costs. Any fee charged by the Creator's bank or payment provider is the Creator's.",
      "5.5 **Holds and clawback.** Company may withhold or reclaim payment for any video that was removed, breached clause 7, or earned its views or engagement through bots, purchased traffic or other manipulation, and may reverse commission on any purchase that was refunded, charged back or linked to code misuse. Company may deduct the amount from the Available Balance or later payouts. If there is nothing to deduct from, the Creator must repay it within 14 days of written request.",
      "5.6 **Final payout.** When this Agreement ends, Company will pay the Available Balance for compliant Content within 30 days, subject to clause 5.5 and the Weekly Payout Cap, which continues to apply until the balance is paid.",
      "5.7 **Changing payout settings.** Company may change the minimum payout, payout days or Weekly Payout Cap by giving 14 days' written notice. A change does not reduce the Available Balance already earned.",
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "6. Content ownership and exclusivity" });
    [
      "6.1 **Ownership.** The Creator owns their Content, except for Company's trade marks, logos, scripts, product footage and other materials Company supplies (**Company Materials**), which stay Company's.",
      "6.2 **Licence to Company.** The Creator grants Company a worldwide, royalty-free licence to use, repost, edit, and run as paid ads (including whitelisting and partnership ads) the Content that counts under clause 3.3, for as long as Company wishes to promote the App. This licence survives termination for Content already paid for. Company will not use the Creator's name or likeness to suggest they endorse anything other than the App.",
      "6.3 **Creator's promises.** The Creator promises that the Content is their own original work, that they have the rights to any music, footage or other material in it, and that it does not infringe anyone's rights or break the law.",
      "6.4 **Exclusivity.** If Schedule A sets exclusivity, the Creator must not post paid content for a direct competitor of the App in the stated category while this Agreement runs.",
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "7. Compliance and conduct" });
    [
      "7.1 **Disclose the ad.** The Creator must clearly disclose that Content is sponsored (for example with #ad and the platform's paid-partnership tool), as required by the advertising and consumer protection laws that apply where the Creator and the audience are located (for example the FTC Endorsement Guides in the United States, the CMA and ASA rules in the United Kingdom, and similar rules elsewhere) and by the platform's rules.",
      "7.2 **Honest claims.** The Creator may only make claims about the App that are true and that match Company's brief. The Creator must not make medical, health-outcome, weight-loss or income claims unless Company has approved the exact wording in writing.",
      "7.3 **Platform rules.** The Creator must follow the terms and community guidelines of each platform they post on, and must not buy views, followers or engagement, or use bots.",
      "7.4 **Brand standards.** The Creator must not post Content that is unlawful, defamatory, hateful, sexually explicit, or that disparages Company, and must take down any Content Company reasonably asks to be removed.",
      "7.5 **Privacy.** The Creator must not post or share anyone's personal information without their consent. Company will handle the Creator's personal information (including payment and identity details) in line with applicable data protection laws (including, where they apply, the GDPR and UK GDPR) and only to run this Agreement and pay the Creator.",
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "8. Term and termination" });
    [
      "8.1 **Term.** This Agreement starts on the Start Date and runs until ended under this clause. Neither party may end it for convenience before the minimum term in Schedule A has passed.",
      "8.2 **Ending by notice.** After the minimum term, either party may end this Agreement by giving 7 days' written notice.",
      "8.3 **Ending for breach.** Company may end this Agreement immediately by written notice if the Creator seriously or repeatedly breaches it (including clauses 3.6, 5.5 or 7), or commits fraud. The Creator may end it immediately if Company fails to pay an undisputed amount within 14 days of written notice.",
      "8.4 **After ending.** The Creator must stop posting new Content for the App and may keep existing Content live unless Company asks for removal. Company will deactivate the Creator Code, and purchases made with it after this Agreement ends earn no commission. Clauses 5.5, 5.6, 6, 9, 10, 11 and 12 survive.",
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "9. Independent contractor" });
    B.push({ t: "p", text: "The Creator is an independent contractor, not an employee, partner or agent of Company. The Creator chooses how and when to create Content, subject to the posting schedule and the brief, and uses their own equipment. The Creator is not entitled to paid leave, pension or retirement contributions, health cover or other employee benefits from Company, and is responsible for their own tax and insurance." });

    B.push({ t: "h", text: "10. Confidentiality" });
    B.push({ t: "p", text: "Each party must keep the other's non-public information (including rates, briefs, unreleased features and Dashboard data) confidential, and use it only for this Agreement, unless the law requires disclosure." });

    B.push({ t: "h", text: "11. Liability" });
    B.push({ t: "p", text: "11.1 To the extent the law allows, neither party is liable to the other for indirect or consequential loss, or loss of profit." });
    B.push({ t: "p", text: "11.2 Company's total liability to the Creator under this Agreement is limited to the Earnings owed and unpaid." });
    B.push({ t: "p", text: "11.3 Nothing in this Agreement excludes or limits any liability or right that cannot be excluded or limited under applicable law." });

    B.push({ t: "h", text: "12. General" });
    [
      `12.1 **Governing law.** This Agreement is governed by the laws of ${law}, and each party submits to the non-exclusive jurisdiction of the courts of ${law}.`,
      "12.2 **Whole agreement.** This Agreement (including Schedule A) is the whole deal between the parties and replaces earlier discussions.",
      "12.3 **Changes.** Except where this Agreement lets Company change something by notice, changes must be agreed in writing, which includes acceptance in the Creator Dashboard.",
      `12.4 **Notices.** Notices go to the Creator's email address in Schedule A, or to ${s.companyEmail.trim() ? s.companyEmail.trim() + " for Company, or " : ""}through the Creator Dashboard.`,
      "12.5 **Electronic signing.** The parties may sign this Agreement electronically and in counterparts, and a typed or drawn signature binds the signer.",
      "12.6 **Assignment.** The Creator may not transfer this Agreement without Company's written consent.",
      "12.7 **Severability.** If a provision of this Agreement is found invalid or unenforceable, the rest of the Agreement continues to apply.",
      "12.8 **No waiver.** A party's delay in enforcing a right under this Agreement is not a waiver of that right.",
    ].forEach((t) => B.push({ t: "p", text: t }));

    B.push({ t: "h", text: "Signatures" });
    B.push({ t: "p", text: "The parties have signed this Agreement on the dates shown below." });
    B.push({
      t: "sig",
      parties: [
        { role: "For Company", org: co, name: [s.companySignatory.trim(), s.companyTitle.trim()].filter(Boolean).join(", ") },
        { role: "Creator", org: creator, name: s.creatorName.trim() },
      ],
    });
    return { blocks: B, settings: s };
  }

  /* ---------- plain text ---------- */
  function toText(blocks) {
    const strip = (t) => t.replace(/\*\*/g, "");
    return blocks.map((b) => {
      if (b.t === "title") return strip(b.text).toUpperCase();
      if (b.t === "h") return "\n" + strip(b.text);
      if (b.t === "b") return "- " + strip(b.text);
      if (b.t === "table") return b.rows.map((r) => r.join(" | ")).join("\n");
      if (b.t === "sig") return b.parties.map((p) => `${p.role} (${p.org})\nSignature: ____________________\nName: ${p.name || "____________________"}\nDate: ____________________`).join("\n\n");
      return strip(b.text);
    }).join("\n");
  }

  /* ---------- HTML preview ---------- */
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inline = (t) => esc(t).split("**").map((seg, i) => (i % 2 ? "<strong>" + seg + "</strong>" : seg)).join("");
  function toHtml(blocks, opts) {
    opts = opts || {};
    let out = "", inList = false;
    const closeList = () => { if (inList) { out += "</ul>"; inList = false; } };
    blocks.forEach((b) => {
      if (b.t !== "b") closeList();
      if (b.t === "title") out += `<h1>${inline(b.text)}</h1>`;
      else if (b.t === "sub") out += `<p class="sub">${inline(b.text)}</p>`;
      else if (b.t === "h") out += `<h2>${inline(b.text)}</h2>`;
      else if (b.t === "p") out += `<p>${inline(b.text)}</p>`;
      else if (b.t === "b") { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${inline(b.text)}</li>`; }
      else if (b.t === "table") {
        out += '<div class="tw"><table><thead><tr>' + b.rows[0].map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
          b.rows.slice(1).map((r, i) => `<tr${i === b.hl ? ' class="hl"' : ""}>` + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
      } else if (b.t === "sig") {
        out += '<div class="sig" id="signatures">' + b.parties.map((p, i) => (opts.signSlot && i === 1) ? `<div class="party"><div class="role">${esc(p.role)}</div><div class="org">${esc(p.org)}</div><div id="sign-slot"></div></div>` :
          `<div class="party"><div class="role">${esc(p.role)}</div><div class="org">${esc(p.org)}</div>` +
          '<div class="line"></div><div class="lab">Signature</div>' +
          `<div class="nm">${esc(p.name)}</div><div class="line"></div><div class="lab">Printed name</div>` +
          '<div class="dt"></div><div class="line"></div><div class="lab">Date</div></div>').join("") + "</div>";
      }
    });
    closeList();
    return out;
  }

  /* ---------- PDF ---------- */
  const THEMES = {
    dark: { bg: [0.102, 0.102, 0.102], text: [0.949, 0.949, 0.949], strong: [1, 1, 1], muted: [0.612, 0.639, 0.686], line: [0.227, 0.227, 0.227], head: [0.149, 0.149, 0.149], hl: [0.122, 0.227, 0.176] },
    light: { bg: [1, 1, 1], text: [0.067, 0.094, 0.153], strong: [0, 0, 0], muted: [0.42, 0.447, 0.502], line: [0.82, 0.835, 0.859], head: [0.953, 0.957, 0.965], hl: [0.906, 0.969, 0.929] },
  };

  async function renderPdf(PDFLib, fontkit, assets, input) {
    const { PDFDocument, rgb } = PDFLib;
    const { blocks, settings: s } = buildBlocks(input);
    const th = THEMES[s.theme] || THEMES.dark;
    const C = (k) => rgb(...th[k]);
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const reg = await doc.embedFont(assets.regular, { subset: true });
    const bold = await doc.embedFont(assets.bold, { subset: true });
    const icon = await doc.embedPng(assets.icon);
    const sigImg = assets.signature ? await doc.embedPng(assets.signature) : null;
    const charset = new Set(reg.getCharacterSet());
    const clean = (t) => Array.from(String(t).replace(/[\u2028\u2029\n\r\t]/g, " ")).map((ch) => (charset.has(ch.codePointAt(0)) ? ch : "?")).join("");

    const [W, H] = s.pageSize === "Letter" ? [612, 792] : [595.28, 841.89];
    const M = 56, CW = W - 2 * M, TOP = 100, BOT = 62;
    const BODY = 9.6, LH = 14.2;
    doc.setTitle(`${s.appName || "MacroSnap"} Creator Agreement`);
    doc.setAuthor(s.companyName || "MacroSnap");
    let page, y;

    function newPage() {
      page = doc.addPage([W, H]);
      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C("bg") });
      const isz = 30;
      page.drawImage(icon, { x: M, y: H - 36 - isz, width: isz, height: isz });
      page.drawText(clean(s.appName || "MacroSnap"), { x: M + isz + 10, y: H - 36 - isz / 2 - 6.2, size: 17, font: bold, color: C("strong") });
      page.drawLine({ start: { x: M, y: H - 78 }, end: { x: W - M, y: H - 78 }, thickness: 0.6, color: C("line") });
      y = H - TOP;
    }
    const ensure = (h) => { if (y - h < BOT) newPage(); };

    // split into unbreakable units, honouring **bold**
    function wrap(text, size, maxW, baseFont) {
      const segs = clean(text).split("**");
      const units = [];
      let cur = [];
      const flush = () => { if (cur.length) { units.push({ sp: false, pieces: cur }); cur = []; } };
      segs.forEach((seg, i) => {
        const f = baseFont === bold ? bold : i % 2 ? bold : reg;
        seg.split(/(\s+)/).forEach((p) => {
          if (p === "") return;
          if (/^\s+$/.test(p)) { flush(); units.push({ sp: true, pieces: [{ t: " ", f }] }); }
          else cur.push({ t: p, f });
        });
      });
      flush();
      const wOf = (u) => u.pieces.reduce((a, p) => a + p.f.widthOfTextAtSize(p.t, size), 0);
      const lines = [];
      let line = [], w = 0;
      units.forEach((u) => {
        const uw = wOf(u);
        if (u.sp) { if (line.length) { line.push(u); w += uw; } return; }
        if (w + uw > maxW && line.some((x) => !x.sp)) {
          while (line.length && line[line.length - 1].sp) line.pop();
          lines.push(line); line = []; w = 0;
        }
        line.push(u); w += uw;
      });
      while (line.length && line[line.length - 1].sp) line.pop();
      if (line.length) lines.push(line);
      return lines;
    }
    function drawLine(line, x, yy, size, color) {
      let cx = x;
      line.forEach((u) => u.pieces.forEach((p) => {
        page.drawText(p.t, { x: cx, y: yy, size, font: p.f, color });
        cx += p.f.widthOfTextAtSize(p.t, size);
      }));
    }
    function para(text, o = {}) {
      const size = o.size || BODY, lh = o.lh || LH, x = M + (o.indent || 0);
      const lines = wrap(text, size, CW - (o.indent || 0), o.font || reg);
      lines.forEach((ln, i) => {
        ensure(lh);
        y -= lh - 3.6;
        if (o.bullet && i === 0) page.drawText("•", { x: M + 3, y, size, font: bold, color: C("muted") });
        drawLine(ln, x, y, size, o.color || C("text"));
        y -= 3.6;
      });
      y -= o.after ?? 6;
    }

    function table(b) {
      const widths = b.widths.map((f) => f * CW);
      const pad = 6, fs = 8.8, lh = 12.4;
      const rowLayout = (r, head) => r.map((c, i) => wrap(c, fs, widths[i] - 2 * pad, head ? bold : reg));
      const drawRow = (r, head, hl) => {
        const L = rowLayout(r, head);
        const h = Math.max(...L.map((l) => l.length)) * lh + 2 * pad - 2;
        let x = M;
        L.forEach((lines, i) => {
          page.drawRectangle({ x, y: y - h, width: widths[i], height: h, color: head ? C("head") : hl ? C("hl") : C("bg"), borderColor: C("line"), borderWidth: 0.6 });
          lines.forEach((ln, k) => drawLine(ln, x + pad, y - pad - 9 - k * lh + 1, fs, head || hl ? C("strong") : C("text")));
          x += widths[i];
        });
        y -= h;
        return h;
      };
      const measure = (r, head) => Math.max(...rowLayout(r, head).map((l) => l.length)) * lh + 2 * pad - 2;
      ensure(measure(b.rows[0], true) + measure(b.rows[1], false));
      drawRow(b.rows[0], true, false);
      b.rows.slice(1).forEach((r, i) => {
        if (y - measure(r, false) < BOT) { newPage(); drawRow(b.rows[0], true, false); }
        const hl = i === b.hl;
        if (hl) { r = r.map((c) => c); }
        drawRow(r, false, hl);
      });
      y -= 10;
    }

    function signatures(b) {
      const need = 215;
      ensure(need);
      const gap = 34, colW = (CW - gap) / 2;
      const top = y - 4;
      b.parties.forEach((p, i) => {
        const x = M + i * (colW + gap);
        page.drawText(clean(p.role), { x, y: top - 10, size: 8, font: bold, color: C("muted") });
        page.drawText(clean(p.org), { x, y: top - 25, size: 11, font: bold, color: C("strong") });
        const isCreator = i === 1;
        const fields = [
          { label: "Signature", gap: 46, val: "", img: isCreator ? sigImg : null },
          { label: "Printed name", gap: 34, val: p.name },
          { label: "Date", gap: 34, val: isCreator ? (s.signedDate || "") : "" },
        ];
        let fy = top - 25;
        fields.forEach((f) => {
          fy -= f.gap;
          if (f.img) { const h = 40, w = Math.min(colW, f.img.width * (h / f.img.height)); page.drawImage(f.img, { x, y: fy + 2, width: w, height: h }); }
          if (f.val) page.drawText(clean(f.val), { x, y: fy + 4, size: 10, font: reg, color: C("text") });
          page.drawLine({ start: { x, y: fy }, end: { x: x + colW, y: fy }, thickness: 0.8, color: C("muted") });
          page.drawText(f.label, { x, y: fy - 11, size: 7.8, font: reg, color: C("muted") });
        });
      });
      y = top - 25 - 46 - 34 - 34 - 24;
    }

    newPage();
    blocks.forEach((b) => {
      if (b.t === "title") { y -= 4; para(b.text, { size: 26, lh: 32, font: bold, color: C("strong"), after: 2 }); }
      else if (b.t === "sub") para(b.text, { size: 11.5, lh: 16, color: C("muted"), after: 14 });
      else if (b.t === "h") { ensure(16 + 3 * LH); y -= 10; para(b.text, { size: 12.5, lh: 18, font: bold, color: C("strong"), after: 4 }); }
      else if (b.t === "p") para(b.text);
      else if (b.t === "b") para(b.text, { indent: 16, bullet: true, after: 4 });
      else if (b.t === "table") table(b);
      else if (b.t === "sig") signatures(b);
    });

    const pages = doc.getPages();
    pages.forEach((pg, i) => {
      const t = clean(`${s.appName || "MacroSnap"} Creator Agreement  ·  Page ${i + 1} of ${pages.length}`);
      const w = reg.widthOfTextAtSize(t, 7.8);
      pg.drawText(t, { x: (W - w) / 2, y: 28, size: 7.8, font: reg, color: C("muted") });
    });
    return await doc.save();
  }

  root.MS = { DEFAULTS, buildBlocks, toText, toHtml, renderPdf };
})(typeof window !== "undefined" ? window : globalThis);
