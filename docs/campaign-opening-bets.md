# Campaign bets: concrete questions and opening recommendations

Draft, October 15, 2026. This replaces the content recommendation in `campaign-launch-slate.md`. Nothing is published. The latest conversation expands revision 6 to include final election threshold and next-prime-minister bets, while requiring machine-collected evidence and a quick operator approval.

Percentages are **my subjective opening recommendations**, not measured frequencies, calibrated forecasts, or proof of fairness. Source facts and judgment are distinguished below. All answers are **Yes / No**; a void refunds both sides. Prices are conditional on a valid, non-void observation. No probability is a statement that an outcome has occurred. Numbers should be refreshed before publication if evidence changes.

## Windows and common rules

- Proposed first observation window starts **October 18, 2026 at 09:00 Asia/Jerusalem (+03:00; 06:00 UTC)**. Short-market betting closes at that instant, before the outcome selection window starts. Publish earlier so people have time to bet. These are proposed game dates, not verified event schedules.
- Poll questions select the **first newly released N12/Midgam national voting-intention poll** within October 18 09:00–October 22 22:00 Israel time. Use the current-party scenario, not hypothetical alliances. No qualifying poll, an ambiguous scenario, or missing values means void. A correction/republication of a poll already released before the start is not a new poll. Publisher/pollster bindings: `HaHadashot 12` / `Midgam R&C`.
- Final-result and PM betting closes **October 27, 2026 at 20:00 Asia/Jerusalem (+02:00; 18:00 UTC)**, subject to the app's configured earlier cap. Final threshold bets settle on the Central Elections Committee's official final results for this election, not exit polls or partial counts. Cancellation or replacement by a different election voids them. A withdrawal counts No only if the election proceeds and the specified list does not qualify; do not silently substitute a new merged list.
- PM bets concern the first new government sworn in following this election, excluding the caretaker government. For a rotation, only the first person sworn in counts. Proposed long-stop: January 31, 2027, 23:59 Israel time. If no new government is sworn in by then, or another election is officially called first, all PM contracts void. This is a proposed explicit timeout, not a prediction of negotiations' length.
- If an outcome is publicly known before cutoff, record its actual public timestamp and refund tickets at or after that time. No automatic settlement from an incomplete feed. Every result needs a source link, captured evidence, calculated result and operator confirmation.

## 1. Bubble parties — four binary questions

| ID | Hebrew title | Yes | No | Rationale |
| --- | --- | ---: | ---: | --- |
| P1 | האם המילואימניקים והכלכלית יקבלו לפחות 4 מנדטים בסקר הבא של חדשות 12 ומדגם? | 60% | 40% | Recent verified N12 and Kan observations show four seats; a marginal pass, not a comfortable one. |
| P2 | האם עמך ישראל יקבלו לפחות 4 מנדטים בסקר הבא של חדשות 12 ומדגם? | 15% | 85% | N12 reports well below threshold, although Kan reports four. Strong publisher dependence. |
| E1 | האם המילואימניקים והכלכלית יעברו את אחוז החסימה בבחירות? | 60% | 40% | Borderline support warrants broad uncertainty; this is an election judgment, not a conversion of a poll into a forecast. |
| E2 | האם עמך ישראל יעברו את אחוז החסימה בבחירות? | 35% | 65% | Cross-publisher disagreement and campaign changes make the final outcome less one-sided than the next N12 observation. |

Primary evidence: [N12, October 12](https://www.mako.co.il/news-israel-elections/2026/Article-cc91389788031a1026.htm) reports Hendel–Zelekha at four seats and Winter at 1.8%; [Kan's poll center](https://skarim.kan.org.il/assets/) displays its October 11 poll with both at four. These were the directly verified publisher observations used for these judgments, not a claim to have collected every latest poll. [N12, October 5](https://www.mako.co.il/news-israel-elections/2026/Article-d7459e0cc7c01a1026.htm) also has Hendel–Zelekha at four and Winter below threshold.

For P1/P2, Yes requires an explicit seat count ≥4; No requires a verified smaller count or the publisher explicitly reporting the list below threshold. A missing party is not zero. For E1/E2, use the official threshold determination: the legal threshold is **3.25% of valid votes**, not a separate four-seat legal test. [Central Elections Committee](https://www.gov.il/he/pages/election-about-info?chapterindex=4).

Do not add every party. These two have direct evidence of being on or across the cutoff. Deeply trailing lists and comfortably passing lists are not included just to fill the board. A later review can add a newly borderline list.

## 2. Poll bloc totals — three binary questions

These predict arithmetic in the named poll, not actual willingness or legal ability to form a government. Freeze the listed parties in the contract. Do not reinterpret “opposition” after a political statement.

| ID | Hebrew title | Included lists | Yes | No |
| --- | --- | --- | ---: | ---: |
| B1 | האם ישר, ביחד, הדמוקרטים וישראל ביתנו יגיעו יחד ל־61 בסקר הבא של חדשות 12? | Yashar, Beyachad, Democrats, Yisrael Beiteinu | 10% | 90% |
| B2 | האם אותן ארבע רשימות, יחד עם רע״ם והמשותפת, יגיעו ל־61 בסקר הבא של חדשות 12? | B1 plus Ra'am and Joint List | 85% | 15% |
| B3 | האם הליכוד, ש״ס, יהדות התורה, עוצמה יהודית והציונות הדתית יגיעו ל־61 בסקר הבא של חדשות 12? | Likud, Shas, UTJ, Otzma Yehudit, Religious Zionism–Zehut | 5% | 95% |

The same verified [October 12 N12 release](https://www.mako.co.il/news-israel-elections/2026/Article-cc91389788031a1026.htm) gives the respective sums **54, 67 and 49**. The large distances from 61 drive these coarse recommendations. In particular, 5% is a subjective tail estimate, not the result of a statistical model or a reason to secretly floor a smaller model estimate. B2 is a seats question and makes no claim that its included parties will cooperate. B1 implies B2; their prices must retain that ordering.

Yes means sum ≥61; No means sum ≤60. Use the same poll for all three. Missing or changed constituent lists, absent values, no qualifying poll or contradictory source totals mean unresolved review and void if no unambiguous observation can be established. The UI should show each number and the sum automatically.

## 3. X — four binary questions

**These are held until the X collector is connected and coverage verified.** No recent full account history was collected in this research. Therefore all four start at the spec's **50% / no_basis** fallback; do not pretend the numbers are posting-rate or topic-frequency estimates. Once a complete recent sample is available, reprice before publication. The 5-post threshold is an initial product choice, not an empirically chosen median.

| ID | Hebrew title | Yes | No |
| --- | --- | ---: | ---: |
| X1 | האם נתניהו יפרסם לפחות 5 פוסטים מקוריים ב־X ביום ראשון, בין 09:00 לחצות? | 50% | 50% |
| X2 | האם לפיד יפרסם לפחות 5 פוסטים מקוריים ב־X ביום ראשון, בין 09:00 לחצות? | 50% | 50% |
| X3 | האם הפוסט המקורי הבא של נתניהו ב־X יזכיר את איראן? | 50% | 50% |
| X4 | האם הפוסט המקורי הבא של לפיד ב־X יזכיר את קטאר או קטארגייט? | 50% | 50% |

Accounts: [@netanyahu](https://x.com/netanyahu), [@yairlapid](https://x.com/yairlapid). Bind stable account IDs when configuring collection, not just display names.

- X1/X2 observation window: October 18 09:00 inclusive to October 19 00:00 exclusive, Israel time. A standalone post or quote-post with the account's own added text counts; replies and bare reposts do not. Count unique post IDs. Edits never increment the count. A captured subsequently deleted post still counts. Yes ≥5, No ≤4 with complete coverage; otherwise void.
- X3/X4 select the first qualifying original post after October 18 09:00 through October 19 09:00, inclusive. Exclude replies/bare reposts; for a quote-post only the account's own text counts. No qualifying post means void, not No. Order by platform creation time, with numeric post ID as tie-breaker.
- Match text only: Hebrew Iran forms `איראן`, `איראני`, `איראנית`, `איראנים`, `איראניות`, and English `Iran`/`Iranian`; Qatar forms `קטאר`, `קטר`, `קטארי`, `קטארית`, `קטארים`, `קטאריות`, `קטרי`, `קטרית`, `קטרים`, `קטריות`, `קטארגייט`, `קטרגייט`, English `Qatar`/`Qatari`/`Qatargate`. Include Hebrew grammatical prefixes and hashtags, case-insensitive English; exclude `קטר` when it means a locomotive. Show the matched token in context for approval. No OCR, audio transcription, linked-article text or embedded quoted-post text.
- Yes is a matching occurrence; No is a fully captured nonmatching post. If an earlier post was missed/deleted before capture or the first published text version cannot be established, void rather than select a later post. Partial collection cannot establish No.

These are literal topic-mention questions, not an unsupported classifier of the “main subject.” A broader subject classifier can be introduced after the simpler evidence flow works.

## 4. Next prime minister — four linked Yes/No questions

| ID | Hebrew title | Yes | No |
| --- | --- | ---: | ---: |
| M1 | האם גדי איזנקוט יעמוד בראש הממשלה הראשונה שתושבע לאחר הבחירות? | 50% | 50% |
| M2 | האם בנימין נתניהו יעמוד בראש הממשלה הראשונה שתושבע לאחר הבחירות? | 30% | 70% |
| M3 | האם נפתלי בנט יעמוד בראש הממשלה הראשונה שתושבע לאחר הבחירות? | 15% | 85% |
| M4 | האם אדם אחר יעמוד בראש הממשלה הראשונה שתושבע לאחר הבחירות? | 5% | 95% |

“Other” includes everyone except those three, including Lieberman and Lapid. The Yes probabilities total 100%; exactly one wins when a qualifying government is formed, and all void together under the common timeout/another-election rule. The suggested probabilities are conditional on that non-void outcome.

The [Polymarket page](https://polymarket.com/event/who-will-be-the-next-prime-minister-of-israel-after-the-next-election), read October 15, displayed roughly 49% Eisenkot, 28% Netanyahu and 16% Bennett. This provides a rough external reference; the recommendation above rounds and adjusts it for our shorter, explicitly defined contract. It is not an executable external quote, and that market's longer rules are not our settlement rules. Official Knesset government-inauguration documentation is the settlement source. A nomination, recommendation to the President, coalition announcement or caretaker continuation does not settle the bet.

## 5. Urich reporting — five independent binary questions

Card title: **עם מי תפורסם התכתבות נוספת המיוחסת ליונתן אוריך עד 22 באוקטובר?** These are additional-reporting bets, not first-ever exposure. The person must be a direct participant, not simply mentioned in someone else's conversation. Multiple rows can win; their probabilities do not sum to 100%.

| ID | Named person / answer | Yes | No |
| --- | --- | ---: | ---: |
| U1 | עמית סגל | 30% | 70% |
| U2 | טופז לוק | 25% | 75% |
| U3 | יעקב ברדוגו | 25% | 75% |
| U4 | נבו כץ | 20% | 80% |
| U5 | בנימין נתניהו | 10% | 90% |

These are low-confidence editorial judgments. Existing attention to Segal supports the highest recommendation; Luk and Bardugo have similar existing reporting evidence; Katz and Netanyahu were described as pending entries rather than verified future publications. No reliable release-rate model exists. The numbers price a possible future news publication, not authenticity or wrongdoing.

**Cutoff:** October 18 09:00 Israel time. **Observation:** October 18 09:00 inclusive through October 22 22:00 exclusive. Eligible outlets are N12/mako news, ynet, Channel 13 News, i24NEWS Hebrew, Kan News, Haaretz/TheMarker and Globes. Yes requires a news article quoting/displaying previously unreported message content attributed to a direct Urich–person exchange concerning public/political work. A new article repeating old content, a denial, speculation or an empty promised entry does not count. No requires the full monitored window without qualifying evidence; missing coverage or unresolved novelty means void. A retraction of the qualifying attribution before confirmation invalidates that evidence. This predicts reported publication, not the truth of the messages.

[Globes on October 11](https://www.globes.co.il/news/article.aspx?did=1001559140) already names Luk, Segal and Bardugo; [mako's October 11 report](https://www.mako.co.il/nexter-news/Article-e4fa4b0c0da21a1026.htm) provides a further baseline. The [October 13 Channel 13 report](https://13tv.co.il/item/news/politics/politics/ln0o2-905394797/?pid=92312) discusses Netanyahu in Urich–Feldstein messages, which is not direct Urich–Netanyahu correspondence. Sara/Yair are omitted because a later TheMarker headline indicates additional coverage but its full text could not be inspected for a complete baseline. See [the detailed research, limitations and exclusions](campaign-urich-pricing-research.md).

The approval packet needs the article, timestamp, minimal relevant passage, participants, and a comparison against known prior reporting. Freeze the prior-report baseline before the window starts. **Hold publication until this collection/comparison works**; it must not become a manual daily news hunt for Omer.

## Count and publication readiness

**20 individual Yes/No bets:** 4 threshold bets, 3 bloc bets, 4 X bets, 4 PM bets and 5 Urich bets. They can be grouped into fewer cards without changing the number of independently settled bets.

The existing app does not yet provide all the automated evidence flows this slate requires. In particular X monitoring, news novelty comparison, frozen-bloc summation, official final-results collection and linked PM-outcome handling need implementation/verification. Do not replace those with an expectation that Omer continuously watches politics. The desired approval card shows captured evidence, calculated outcome, exclusions/coverage, and one confirmation action.

These recommendations are content preparation. They do not change application code, wallets, the prior spec file, or existing survey data. Review the scope additions against implementation before publishing; update probability inputs if the observation windows move.
