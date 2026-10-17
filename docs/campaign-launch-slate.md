# Campaign side bets: first launch slate

Prepared October 15, 2026 (America/Denver). **Draft contracts for operator review; nothing has been published or priced by a model.** Follows [revision 6](prediction-markets-spec.md). Research of external imports is recorded separately in [the October 15 refresh](campaign-import-refresh.md).

## Recommendation

Start with **four questions: A, B, C and D**. They give the league a quick activity result, two lighthearted video questions, and a poll to follow. E is a second poll option. F is an optional longer withdrawal question. Keep the interview slot empty until a real future booking is announced.

These are proposed game windows, **not claims that a video, poll, or interview is scheduled**. The dates deliberately start on Sunday, October 18, leaving time to launch the pilot. Publish by October 17 at 21:00 Israel time if using these contracts. If the pilot starts later, draft new future windows before publication; never extend a funded contract.

All dates below use **Asia/Jerusalem**. The window includes its start and end; bets must arrive strictly before the cutoff. The first five contracts close betting at **2026-10-18 09:00 +03:00 / 06:00 UTC**. Sources must be checked again immediately before publication. Existing videos and polls are evidence only, never the target outcome.

| ID | Hebrew card title | Type | Observation window, Israel time | Readiness |
| --- | --- | --- | --- | --- |
| A | האם יעלה פוסט וידאו בערוץ נתניהו ביום ראשון עד 18:00? | `channel_activity` | Oct 18, 09:00–18:00 | Complete draft; verify feed and approve |
| B | האם איראן תוזכר לפחות 3 פעמים בסרטון הקמפיין הבא בערוץ נתניהו? | `mention_count` | Oct 18, 09:00 → Oct 19, 23:00 | Complete draft; operator must be able to play the full asset |
| C | האם קטאר תוזכר בסרטון הבא בערוץ לפיד? | `mention_count` | Oct 18, 09:00 → Oct 22, 22:00 | Complete draft; same playback requirement |
| D | האם הליכוד יעלה מעל 20 מנדטים בסקר הבא של חדשות 12 ומדגם? | `poll_movement` | Oct 18, 09:00 → Oct 22, 22:00 | Complete draft; add verified Oct 12 evidence before pricing |
| E | האם הדמוקרטים יקבלו לפחות 10 מנדטים בסקר הבא של חדשות 12 ומדגם? | `poll_value` | Oct 18, 09:00 → Oct 22, 22:00 | Optional; same poll review as D |
| F | האם נתניהו יודיע בערוץ הרשמי עד 26 באוקטובר ב־23:59 שלא יתמודד לכנסת? | `deadline_event` | Oct 18, 09:00 → Oct 26, 23:59 | Optional; official-announcement check and local pricing needed |

These are all side bets. D and E concern a published **opinion poll**, never final election results. The preview's National Unity ≥10 question is not carried over: E uses a party and threshold grounded in the verified current poll instead.

## Common settlement terms

- Use the exact source and selection rule below. The first qualifying item fixes the outcome; do not pick a later, more interesting item. Order Telegram posts by their original publication timestamp, then numeric post ID if timestamps tie. For an album, use the smallest post ID containing a qualifying video.
- Save the direct item/article link, original public timestamp, observed value, and a short explanation. Mention questions also need a timestamped tally. Empty evidence is unresolved; zero must be entered explicitly.
- For mention questions, capture the complete selected asset. If an item is edited before settlement, use the captured first version. If the first version cannot be established and the change could affect qualification or the count, void rather than switch to another item.
- If the outcome becomes public before the planned cutoff, close it and record that time; refund tickets at or after that time. If the answer is already known before publication, do not publish that question. A market remaining open on an external exchange does not prove its answer is unknown.
- No qualifying content means **void** for B–E, because there is no observation to count. For A and F, absence is the event being predicted and can mean **No**, but only after the deadline and adequate source coverage. A failed collector or missing page alone never proves No.
- No community veto is added here: revision 6 uses operator void with a public reason and refunds.

## A — Sunday video activity

**Title:** האם יעלה פוסט וידאו בערוץ נתניהו ביום ראשון עד 18:00?

**Source:** the verified [Benjamin Netanyahu Telegram channel, `@bnetanyahu`](https://t.me/s/bnetanyahu). Its public preview identifies it as his official channel and exposes video posts. This is Netanyahu's channel, not a claim that an unrelated channel named “Likud” is official.

**Cutoff:** October 18, 2026, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00–18:00 +03:00 (06:00–15:00 UTC).

**Yes:** at least one new Telegram post with a native, playable video attachment is published by this channel within the window. A forwarded video or a re-upload counts: this predicts publication on the named channel, not first-ever creation of footage. A link to another site's video, a photo, an animated GIF, a live-stream announcement without a video, an edit to an old post, or pinning an old post does not count.

**No:** the window ends without such a post, and the operator can verify the channel history through the whole window.

**Void:** channel unavailable or history incomplete enough that neither a qualifying post nor its absence can be established. A preserved valid video-post link and timestamp can establish Yes even if the post is later deleted; without preserved evidence, do not infer the answer.

**Entry:** `comparison=event`, `threshold=1`; observed `1` or `0`. Bind the exact Telegram source record. Collector prefill is a suggestion: verify the attachment type before confirming, since a text post must not produce Yes.

**Pricing evidence:** the live feed supplies prospective posting history, but this research did not collect a complete, dated history of comparable nine-hour windows. A total video count is not a posting-rate estimate. Until such a snapshot is supplied, use the specified **50% / no_basis** fallback, not a guessed high probability. Proposed Hebrew rationale: `אין עדיין היסטוריית פרסום מלאה לחלונות זמן דומים; מתחילים ב־50/50.`

## B — Iran in the next campaign video

**Title:** האם איראן תוזכר לפחות 3 פעמים בסרטון הקמפיין הבא בערוץ נתניהו?

**Source:** [the same official channel](https://t.me/s/bnetanyahu). The existing [post 7304](https://t.me/bnetanyahu/7304) is a discovery reference visible in the channel preview, not a future target or a verified audio tally. No existing post is selected for settlement.

**Cutoff:** October 18, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00 → October 19, 23:00 +03:00 (October 19, 20:00 UTC).

**Qualifying asset:** the first non-forwarded native video post in the window, 10–300 seconds long inclusive, whose original caption contains `ליכוד` or `מחל` (also accept `מח״ל` and `מח"ל`). This mechanical selection rule is the contract's definition of a campaign video; no subjective judgment about whether it “looks like an ad.” Re-uploaded footage counts as a new post. Count only that attached video, excluding any website player pre-roll or separate linked video. For multiple qualifying videos in an album, use the first by post ID.

**Yes:** at least three audible occurrences of the country name Iran in Hebrew in that asset. **No:** a qualifying asset exists and the count is zero, one, or two.

**Counting:** count `איראן` and the forms `באיראן`, `לאיראן`, `מאיראן`, `כאיראן`, including a preceding conjunction `ו` or relative prefix `ש`. Each spoken repetition counts, including a recorded quotation or song. Do not count adjectives such as `איראני` / `איראנית`, English “Iran,” captions, on-screen text, or text accompanying the post. Count all speakers, not just Netanyahu. If the audio is unintelligible at a potentially decisive word, void rather than guess.

**Void:** no qualifying asset by the end; the selected asset or its original caption cannot be verified; the full audio is unavailable; or a decisive count remains ambiguous. Do not skip an unavailable first qualifying asset to settle on the second.

**Entry:** `comparison=gte`, `threshold=3`; observed is the integer audio count. Include a tally such as `00:12, 00:31, 00:58` only after actually watching. There is no completed tally today.

**Pricing evidence:** channel captions show campaign content but do not establish audio word frequencies. No prior comparable ads were transcribed or tallied in this research. **50% / no_basis** is the honest fallback. Proposed rationale: `אין מדגם מתומלל של סרטוני קמפיין קודמים; מתחילים ב־50/50.`

## C — Qatar in Lapid's next video

**Title:** האם קטאר תוזכר בסרטון הבא בערוץ לפיד?

**Source:** the verified [Yair Lapid political Telegram channel, `@YLapid`](https://t.me/s/YLapid), also linked from [Lapid's X profile](https://x.com/yairlapid/with_replies). The public feed contains native videos and forwarded items, so the selection rule must distinguish them.

**Cutoff:** October 18, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00 → October 22, 22:00 +03:00 (October 22, 19:00 UTC).

**Qualifying asset:** the first non-forwarded native video post in this channel within the window, 15–360 seconds inclusive, with intelligible speech. No requirement that Lapid personally appears: the title predicts the channel's video. Re-uploads count. Exclude photos, GIFs, external links and text-only announcements. Use the common ordering and original-version rules.

**Yes:** at least one audible Hebrew occurrence of the country name Qatar. **No:** a qualifying video exists and contains zero such occurrences.

**Counting:** accept `קטאר` and `קטר` when pronounced as the country, including grammatical prefixes `ב`, `ל`, `מ`, `כ`, `ו`, `ש` and combinations of those prefixes. Exclude `קטר` meaning a train engine; exclude adjectives such as `קטארי` and the compound `קטארגייט` / `קטרגייט`. Count every speaker; text/subtitles do not count. These exclusions keep the title literal. If Omer prefers “Qatar or Qatargate,” change the title and accepted words together **before** publication.

**Void:** no qualifying asset; first qualifying asset or original version unavailable; or decisive audio ambiguity. **Entry:** `comparison=gte`, `threshold=1`, observed integer count and timestamped tally.

**Pricing evidence:** there is no completed comparable-video tally. Use **50% / no_basis** unless that evidence is actually assembled. Proposed rationale: `אין בסיס מתומלל להערכת אזכור קטאר בסרטון הבא; מתחילים ב־50/50.`

This replaces the preview's unscheduled “next interview” with a bounded channel question. It does not assert that an interview has been booked.

## D — Likud poll rebound

**Title:** האם הליכוד יעלה מעל 20 מנדטים בסקר הבא של חדשות 12 ומדגם?

**Source:** N12's own poll publication, by **Midgam / Mano Geva**. The [October 12 publication](https://www.mako.co.il/news-israel-elections/2026/Article-cc91389788031a1026.htm) gives Likud **20** seats and identifies the pollster. Its article timestamp is 21:00; that is an article timestamp, not proof of the first television broadcast time. The [October 5 publication](https://www.mako.co.il/news-israel-elections/2026/Article-d7459e0cc7c01a1026.htm) gives Likud **21** and the same pollster.

**Cutoff:** October 18, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00 → October 22, 22:00 +03:00 (October 22, 19:00 UTC).

**Target:** the first new national Knesset voting-intention poll commissioned/published by N12 and conducted by Midgam that becomes publicly available in the window. Use the standard current-party lineup, not a hypothetical merger or alternate-leader scenario. An article updating an already-public older poll is not a new poll. If no unique standard scenario can be identified, void. A future poll release schedule was **not** verified; no poll in the window means void.

**Yes:** Likud receives at least 21 seats in the target poll. **No:** it explicitly receives 20 or fewer. Absence from a table is not zero. If the named party is merged/replaced or no explicit number can be verified, void.

**Baseline:** freeze **20 from October 12**, not “whatever the previous poll happens to be.” A newly published intervening poll can inform pricing but cannot change this baseline after publication. **Entry:** `subject=likud`, `pollster=Midgam R&C`, `publisher=HaHadashot 12`, `baseline=20`, `comparison=gt`, `threshold=0` (observed movement = target seats minus 20).

**Void:** no qualifying poll; missing party number; hypothetical-only release; irreconcilable source ambiguity or unavailable evidence. Record the first public release time for early-outcome handling, independently of the importer run time.

**Pricing evidence:** the two linked primary-source results plus the prior same-pollster series are useful inputs, not a computed probability. The local `data/wikipedia-surveys.json` snapshot checked on October 15 has N12 through October 5, **not October 12**. Add the verified October 12 result to the reviewed evidence workflow before requesting a quote; do not price from an incomplete series while labeling it current. That file was not edited here. No LLM quote has been generated.

## E — Democrats reach double digits in a poll

**Title:** האם הדמוקרטים יקבלו לפחות 10 מנדטים בסקר הבא של חדשות 12 ומדגם?

**Source and target selection:** the exact N12/Midgam poll definition in D, with the same direct [October 12](https://www.mako.co.il/news-israel-elections/2026/Article-cc91389788031a1026.htm) and [October 5](https://www.mako.co.il/news-israel-elections/2026/Article-d7459e0cc7c01a1026.htm) evidence. Both publications report **9** for the Democrats.

**Cutoff:** October 18, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00 → October 22, 22:00 +03:00 (October 22, 19:00 UTC).

**Yes:** Democrats explicitly receive at least 10 seats in the first qualifying poll. **No:** explicitly 9 or fewer. **Void:** the same missing-poll, missing-number, changed-party and ambiguous-scenario cases as D. Do not silently substitute a merged or successor party.

**Entry:** `subject=democrats`, `pollster=Midgam R&C`, `publisher=HaHadashot 12`, `comparison=gte`, `threshold=10`; observed is seats, not movement. D and E share a source poll but concern different subjects/types, so do not put them into one threshold pricing group. Verify each prefill against the same selected release.

**Pricing evidence:** the same dated primary-source series, including the missing October 12 observation. No probability has been computed. This is an optional fifth market, not required for the four-bet pilot.

## F — Optional Netanyahu withdrawal announcement

**Title:** האם נתניהו יודיע בערוץ הרשמי עד 26 באוקטובר ב־23:59 שלא יתמודד לכנסת?

**Source:** [Netanyahu's official Telegram channel](https://t.me/s/bnetanyahu). Inspired by [the Polymarket question](https://polymarket.com/event/netanyahu-drops-out-before-election), but narrowed explicitly to a statement published on the named channel. This is **an adapted local contract**, not a promise to follow Polymarket's result.

**Cutoff:** October 18, 09:00 +03:00 (06:00 UTC). **Window:** October 18, 09:00 +03:00 → October 26, 23:59 +02:00 (October 26, 21:59 UTC). The UTC offset changes during this window; use the named timezone when entering dates. This ends before the default October 27, 20:00 election cap; recheck the configured cap.

**Yes:** a direct, definite statement by Netanyahu, published as channel-authored text or his own recorded speech on the named channel during the window, says he will not run for the Knesset in the upcoming election. A forwarded item qualifies only if it contains his verifiable direct statement. A statement that he is considering withdrawal, a rumor, a different candidate's withdrawal, a resignation from another office, or a promise to retire after the election does not qualify. A later retraction does not undo a qualifying announcement: the question concerns making the announcement.

**No:** no qualifying statement is published there by the end and the operator verifies adequate channel history. **Void:** evidence cannot establish whether a qualifying statement occurred during the window. **Entry:** `comparison=event`, `threshold=1`; observed `1`/`0` with the direct post link and timestamp.

**Publication blocker:** check official announcements and credible reports immediately before launch. If the underlying withdrawal has already been announced elsewhere, do not offer this as an unresolved withdrawal bet merely because the selected channel has not reposted it. The research has not exhaustively audited all prior announcements.

**Pricing evidence:** the external market is still active in the [fresh API check](campaign-import-refresh.md), but its rules have a broader source policy and start horizon. Its external 1.6% Yes reference is below our evidence-based minimum; it is neither local odds nor a reason to silently clamp to 5%. Obtain a separate local quote from sourced evidence or leave the draft pending. The no-basis 50% fallback is available under the spec if the model has no usable basis, but the operator should consciously review whether that makes this particular question a worthwhile game. It is not part of the recommended first four.

## Interview reserve — not ready to publish

Desired title: **האם לפיד יאמר ״קטאר״ בריאיון ל[מראיין] ב[תוכנית] ב[תאריך]?**

No future interview with a verified program, guest, date and time was found in this bounded primary-source research. Old Telegram posts saying “today at 18:10” are **not** a future booking. Do not fill these blanks from a regular program schedule or guess an appearance.

Once a dated first-party announcement exists, use type `statement`, the broadcaster's complete interview as the named source, and exactly **50% / no_basis** per revision 6. Set a concrete cutoff before broadcast and an exact observation window from the actual announcement. Yes requires Lapid himself to audibly say the accepted country name during that interview; No requires an available complete interview without it; cancellation, missing full recording or a different guest means void. Exclude the interviewer's question, promotional clips, news voice-over and unrelated segments. Copy C's accepted-word rule into the published contract. Until the event exists, **there is intentionally no publishable timestamp or source URL** for this slot.

## Import decisions and the short operator handoff

The [fresh import review](campaign-import-refresh.md) confirms both saved candidates remain open at the providers. Netanyahu withdrawal is optional F after explicit local adaptation. Defer Trump endorsement: its original October 28 horizon is outside the intended election-bounded launch, and its text/date metadata need a precise local rewrite. Neither exchange supplies the four recommended daily/weekly questions.

Omer's remaining decisions are small:

1. Confirm the proposed Sunday pilot window, or choose later future dates before creating drafts in the app.
2. Configure the two exact Telegram channels and verify playback of native video. Review first-item selection manually; the collector does not certify the caption, speaker, duration or word count.
3. Add the missing N12 October 12 evidence through the existing review workflow; bind the publisher/pollster labels exactly as listed in D. Check for newer primary-source polls before requesting quotes.
4. Approve A–D's wording, generate/review quotes, and publish through the operator interface. Add E only if a second poll question is wanted. Hold F and the interview slot until their explicit checks are complete.

No application code, wallets, saved external examples, or existing survey data were changed. This is research and contract preparation, not a seed script or automatic publication instruction.
