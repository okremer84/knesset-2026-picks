# Campaign import candidate refresh

Verified October 15, 2026 at 14:28 UTC (17:28 Asia/Jerusalem; 08:28 America/Denver), using fresh unauthenticated GETs to the providers' official APIs. This is a status snapshot, not approval to publish. Only this document was added; saved examples and application code were not changed.

## Recommendation

Keep the Netanyahu withdrawal question as an optional longer-duration draft. Defer the Trump endorsement question until its local deadline and scope are explicitly rewritten. Neither fills the desired daily/weekly ad, interview, or poll slate. Both still require an official-channel review for an already-known outcome immediately before publication: an exchange's open status alone does not prove the answer remains unknown.

## Polymarket: Netanyahu withdrawal

[Public market](https://polymarket.com/event/netanyahu-drops-out-before-election) · [Official market API, ID 5237293](https://gamma-api.polymarket.com/markets/5237293)

- Fresh response: active, not closed, accepting orders. Provider update: October 15, 2026 at 13:02:21 UTC.
- Rules concern a definitive Netanyahu announcement that he will not seek reelection to the Knesset in this election. Speculation or consideration does not qualify. The rules prefer official Netanyahu information, with a consensus of credible reporting as fallback.
- Written deadline: **October 26, 2026 at 23:59 Asia/Jerusalem**, equivalent to **21:59 UTC**. API `endDate` remains **October 27 at 03:59 UTC**, equivalent to **05:59 Jerusalem**: a six-hour discrepancy. Use neither automatically; explicitly approve the local written deadline.
- The written deadline precedes the repository's default election cap of **October 27 at 20:00 Jerusalem** (18:00 UTC). A configured earlier election date could change that assessment.
- External `outcomePrices` remain Yes 0.016 / No 0.984. These are external reference prices, not local quotes; 1.6% lies below the local 5% minimum for evidence-based quotes. Do not copy or silently clamp this into a purported LLM assessment.
- Suggested Hebrew draft title: **האם נתניהו יודיע עד 26 באוקטובר ב־23:59 שלא יתמודד בבחירות לכנסת?**
- Before publication: select and verify the exact official announcement channel; explicitly fix the observation start and betting cutoff; check for an existing definitive announcement; define unavailable-evidence void handling. The wording above is a draft title, not a complete contract.

## Kalshi: Trump endorsement

[Official market API, KXDJTENDORSENETANYAHU-26JUN30-OCT28](https://external-api.kalshi.com/trade-api/v2/markets/KXDJTENDORSENETANYAHU-26JUN30-OCT28)

- Fresh response: status active, result empty. Its provider `updated_time` remains June 30, 2026; that old field is not the timestamp of this fresh retrieval.
- Rules require a direct, public, affirmative endorsement of Netanyahu for the election. Praise without electoral support, conditional statements, likes and bare reposts do not count. Official-channel statements and qualifying commentary on quote posts can count.
- Text says before October 28. API close, expiration and occurrence timestamps are **October 28 at 14:00 UTC**, equivalent to **16:00 Jerusalem**. This should not be treated as a precise interpretation of the text's date boundary without further operator review.
- This original event horizon is after the default election-day cap. Revision 6 explicitly caps betting cutoffs; shortening the observation horizon as well would create a different local question. For the intended election-bounded launch, rewrite both dates explicitly instead of presenting this as an unchanged import.
- Fresh external last trade is **$0.1000**, versus **$0.2900** in the saved October 14 snapshot. Current Yes bid **$0.1700**, ask **$0.3000**. Last trade, bid and ask are different observations; the last trade being outside the current spread is another reason not to label it an authoritative probability.
- Suggested adapted Hebrew draft title: **האם טראמפ יתמוך בפומבי בבחירת נתניהו עד 27 באוקטובר ב־20:00?** This is a proposed local deadline, not the external contract.
- Before publication: verify the official Trump channel and absence of an already-qualifying endorsement; choose observation start and an explicit betting cutoff; approve the shortened horizon, public endorsement definition and void rule; obtain separate local pricing evidence. Do not use the original price as the price of the adapted contract.

## Verification limits

The web browsing tool could not open either API. Direct public HTTP requests succeeded and supplied the fresh fields above. No trading, account access, draft creation in the application, publishing, or settlement occurred. This refresh did not independently audit Netanyahu's or Trump's full announcement history, so neither candidate is marked ready to publish. The exchange rules and timestamps were inspected; linked PDF contract terms were not re-reviewed.
