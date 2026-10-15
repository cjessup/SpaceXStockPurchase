# Changes

Notes for the work published to `main` in commit `78a2da0` and rebuilt on GitHub Pages.

Live site: https://cjessup.github.io/SpaceXStockPurchase/

Local site: run `npm start`, then open http://localhost:3000

## Extended-hours prices

The quote API was only reading Yahoo's regular-session price. That value stops moving at the closing bell, so the page looked frozen during pre-market and after-hours trading.

`/api/quotes` and the browser fallback now request Yahoo's public chart feed with `includePrePost=true`. The headline price is the newest of the pre-market, regular, and after-hours prints. The chart includes those extended-hours bars, from 4:00 AM ET through the after-hours session.

While the regular session is open, the card still shows the live regular price. After the close it switches to the after-hours price, labels the card **After hours**, and shows the move versus the regular close. When that session ends, the last after-hours print stays on the card. Pre-market works the same way. Portfolio value and the Tesla/SpaceX swap math use that same price.

Yahoo's older quote endpoint now returns 401 without a login crumb, so it is not used. If Yahoo omits the live extended-hours field, the newest 5-minute bar is used instead, which can lag by up to five minutes.

The shared parser lives in `docs/quotes.js`. `server.js` uses it for `/api/quotes`. The page uses the same parser when it cannot reach the local API.

## Saved share counts

Tesla and SpaceX shares owned are stored in this browser under the key `spacex-stock-holdings`. The counts are written as you type and filled in on the next visit. The holdings values are calculated from the saved counts once prices load.

The saved counts belong to the browser and the site address. Another browser, a private window, or a different host (for example localhost versus GitHub Pages) keeps its own copy. Clearing the site's stored data removes them.

## GitHub Pages

The update was pushed to `main`. GitHub Pages publishes the `docs` folder on that branch. The rebuild for `78a2da0` completed, and the live site is serving the new quote parser and the saved-holdings script.

On GitHub Pages there is no `/api/quotes` server. The page calls Yahoo directly, then `corsproxy.io`, then `api.allorigins.win`. Those public proxies are a fallback and can fail. Running `npm start` uses the local API and does not depend on them.
