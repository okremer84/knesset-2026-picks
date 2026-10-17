# Party-leader next-post markets

Research date: 2026-10-17. Scope: primary-source account discovery, accessible recent-post evidence, and deterministic settlement proposals. No code changes are represented by this note.

## Evidence actually obtained

No complete latest-20–30-post sample was accessible for any account in this research session. Direct requests to the Netanyahu, Lapid, Bennett, and Lieberman X timelines returned HTTP 403. Search-index results exposed profile descriptions and an isolated older post, but do not establish chronology, completeness, edits, or the latest posts. **No numerical next-post probabilities can be derived from this research.** A displayed 50% fallback must say “no sample yet,” not “estimated from 30 posts.”

| Person | Candidate account | Complete consecutive recent sample | Evidence / limitation |
| --- | --- | --- | --- |
| Benjamin Netanyahu | [@netanyahu](https://x.com/netanyahu) | 0 | Already configured in repository; public timeline inaccessible in this run. |
| Yair Lapid | [@yairlapid](https://x.com/yairlapid) | 0 | Already configured in repository; public timeline inaccessible in this run. |
| Naftali Bennett | [@naftalibennett](https://x.com/naftalibennett/with_replies) | 0 | Indexed first-party profile identifies Israel's 13th prime minister and links his campaign site; profile snapshot is several months old. |
| Avigdor Lieberman | [@AvigdorLiberman](https://x.com/AvigdorLiberman) | 0 | One [indexed June 7 post](https://x.com/AvigdorLiberman/status/2063653091526803589) is condolences after an attack. It is not a representative current sample and was excluded from pricing. |
| Yair Golan | [@YairGolan1](https://mobile.x.com/YairGolan1/with_replies) | 0 | Indexed first-party profile identifies the Democrats leader and links the party domain. No consecutive posts captured. |
| Benny Gantz | [@gantzbe](https://x.com/gantzbe/with_replies?lang=en) | 0 | Indexed first-party profile identifies Gantz and links his party domain. No consecutive posts captured. |
| Gadi Eisenkot | Not verified in this run | 0 | Do not guess a handle or attach another person's feed. Verify an official outbound link and stable X account ID first. |

These are candidate identities, not a claim that all current account ownership was independently authenticated. Resolve and bind stable account IDs before live collection; retain the verified identity source and review date.

## Suggested question slate

The following are editorial product ideas, **not findings about observed post frequencies**. Start with different people and subjects; allow all supported subjects for every verified account.

| Person | Example Hebrew question | Literal keyword family |
| --- | --- | --- |
| Netanyahu | האם הפוסט הבא של נתניהו יזכיר את איראן? | Iran |
| Lapid | האם הפוסט הבא של לפיד יזכיר את קטאר? | Qatar |
| Bennett | האם הפוסט הבא של בנט יזכיר גיוס? | Conscription |
| Lieberman | האם הפוסט הבא של ליברמן יזכיר גיוס? | Conscription |
| Golan | האם הפוסט הבא של גולן יזכיר מלחמה? | War |
| Gantz | האם הפוסט הבא של גנץ יזכיר חטופים? | Hostages |

Use independent Yes/No questions. A post can mention several subjects, so these percentages should not be normalized into a mutually exclusive “next subject” pie. Label them keyword questions, since literal word matching cannot establish a post's broader meaning.

## Proposed fixed matching contract

Publish the accepted vocabulary with each question and freeze its version when the market opens. Proposed Hebrew families: Iran `איראן, איראני, איראנית, איראנים, איראניות`; Qatar `קטאר, קטארי, קטארית, קטארים, קטאריות, קטארגייט, קטרגייט`; conscription `גיוס, להתגייס, מתגייס, מתגייסים, מתגייסות, התגייסות, השתמטות, משתמט, משתמטים`; war `מלחמה, מלחמות`; hostages `חטוף, חטופה, חטופים, חטופות`. English equivalents, if included in the visible contract: `Iran, Iranian`; `Qatar, Qatari, Qatargate`; `conscription, enlistment, enlist, draft`; `war, wars`; `hostage, hostages`. The English word “draft” is ambiguous: preferably exclude it unless the question explicitly bets on that literal word.

1. Select the first qualifying original post authored by the fixed account ID in `[window_start, window_end)`, ordered by creation timestamp then numeric original post ID. Close betting no later than `window_start`.
2. Exclude replies and reposts. Include quote posts, but inspect only the account's own added text, never the quoted post's content. Use full `note_tweet.text` when present, otherwise `text`.
3. Use the original captured edit version. A later edited version is not sufficient proof of original wording. Deduplicate by the first `edit_history_tweet_ids` ID.
4. Strip URLs; exclude linked-page titles/content, images, alt text, OCR, video/audio transcripts and quoted-post text. Retain literal words in hashtags. Normalize Unicode and Hebrew diacritics consistently in both training and settlement.
5. Match full word boundaries and a published finite Hebrew prefix policy; avoid arbitrary substring matches. The existing implementation accepts up to three characters from `ובכלמשה` before the Hebrew family. If that policy is retained, expose it and apply the same matcher to historical samples. A negation still counts because this is a literal-mention question.
6. Yes means at least one accepted match in the selected post; No means that selected post is fully available and has no accepted matches. No post by the deadline means void. Missing collection, an unavailable original version, or uncertainty over the first post must not become No.

## Historical estimate after collection is available

Collect the latest 30 qualifying posts before the pricing cutoff, independent of keyword. Never retrieve a topic-filtered search result and treat its match rate as a sample. Paginate until 30 qualifying originals are available, or explicitly report fewer, subject to a bounded lookback. Record all IDs, source URLs, timestamps, original-version status, sample cutoff, oldest post date and matcher version. X documents continuation using `meta.next_token` and `pagination_token` in its [official pagination documentation](https://docs.x.com/xdks/python/pagination).

For an initial transparent estimator, show the actual `k / n` rate and use `(k + 1) / (n + 2)` as a smoothed starting quote. This is a proposed modeling convention, not a forecast validated by this research. Require at least 20 qualifying posts for the historical estimate; below that use the existing no-basis policy. Limit the sample to a recent explicit lookback (for example 30 days) and show its age. A 20–30-post sample is small, posts are correlated, and campaign events change topics; expose the sample count rather than imply precision. Do not use posts after the market's pricing cutoff. Preserve the evidence behind each quote so subsequent posts do not silently rewrite its explanation.

## Repository findings at inspection

- [`MonitorCollector.php`](../app/Services/Campaign/MonitorCollector.php) resolves stable IDs, requests post timestamps/edit history/full text, excludes replies and reposts, and uses bounded pagination. Its existing query starts only **two days** before now, so 30 qualifying posts are not guaranteed. Separate historical backfill from live coverage; never treat an exhausted two-day result as 30 posts.
- [`Monitoring.php`](../app/Services/Campaign/Monitoring.php) currently supports only `iran` and `qatar` for `x_next_mention`. It already requires original-version capture, orders by timestamp and post ID, and distinguishes no post from a negative match. New topics need one shared dictionary used by both pricing and settlement.
- [`Evidence.php`](../app/Services/Campaign/Evidence.php) exposes the latest 100 observations for selected monitoring sources. Raw observation inclusion alone is not a reproducible latest-30 estimator: sample cutoff, eligibility, deduplication and the matching version must be explicit.
- [`CampaignMonitoringController.php`](../app/Http/Controllers/CampaignMonitoringController.php) initially registers Netanyahu and Lapid. Broaden the verified-account catalog without implying a successful API fetch.
- [`config/campaign.php`](../config/campaign.php) requires `CAMPAIGN_X_BEARER_TOKEN` for X collection. This research did not read or disclose credentials and did not execute authenticated collection.

The immediate useful implementation is broader account/topic options plus honest missing-sample states, and a reusable latest-30 sampler that can produce evidence-backed quotes when authorized X access returns actual posts. This research does not establish current topic percentages.

## Broadcaster diversification: additional primary-source checks

| Broadcaster | Current source checked | Institute evidence |
| --- | --- | --- |
| Channel 12 | [October 12 poll](https://www.mako.co.il/news-israel-elections/2026/Article-cc91389788031a1026.htm) | Article explicitly credits Midgam / Mano Geva; 509 actual respondents. Likud 20 seats. |
| Channel 13 | [October 14 poll on the pollster's site](https://themadad.com/סקר-מנדטים-14-10-2026/) and [pollster homepage](https://themadad.com/) | Homepage labels October 14 figures as Channel 13 / HaMadad. The dated page links the broadcast video. |
| Channel 14 | [October 14 poll](https://www.c14.co.il/article/1739046) | Article explicitly credits **NEXT DATA**, analysis by Shlomo Filber, 568 adults. Do not hardcode Direct Polls for these current Channel 14 questions. |
| Kan 11 | [October 11 original report](https://www.kan.org.il/content/kan-news/politic/1108256/) and [official poll hub](https://skarim.kan.org.il/) | Original article title was accessible, body was not extracted. Kantar/Hassid attribution for this date was not independently confirmed from primary methodology text in this run. Preserve the existing imported attribution pending that check. |

Do not compare each outlet's loosely named “opposition” total without a shared definition. The N12 report explicitly gives 67 anti-Netanyahu seats, comprising 54 Zionist opposition plus 13 Arab-party seats, and keeps another four-seat list separate. Channel 14 reports left bloc 44 and Arab parties 14 separately. Freeze and display the party IDs included in the market's sum; adding or dropping a party later changes the question. Seat counts are not vote percentages, and prime-minister suitability poll shares are not probabilities of becoming prime minister. Use each outlet's own original report for settlement and preserve publisher and institute independently.
