# Finance visual theme

## Compact token summary

- Product feel: joyful, calm, low-cognitive-load personal finance.
- Primary ink: `#30263D`; soft text `#675D70`; faint text `#94889E`.
- Surfaces: cream `#FFF9EE`, warm white `#FFFCF6`, cards `#FFFFFF`.
- Accents: yellow `#F7C948`, lilac `#A78BFA`, turquoise `#2EC4B6`, deep pink `#C94F7C`.
- Status: good `#178A78`, warning `#B47700`, bad `#B83D68`.
- Borders: `#E8DFF0`; soft border `#F3EDF7`.
- Type: system sans-serif for body; existing Finance inner page uses a high-contrast serif display face for major headings.
- Shape: cards and controls use 12–18px rounded corners; chips are pill-shaped.
- Shadows: soft lavender-tinted `0 7px 22px rgba(72,50,90,.07)`.
- Motion: short 160–280ms feedback; all animation must disable under `prefers-reduced-motion: reduce`.
- Touch: interactive controls are at least 44px tall; strong lilac focus rings.
- Mobile: layouts collapse below 600px; avoid horizontal scrolling except for the existing top tabs.

## Raw theme source: `theme-jaimi.css`

```css
/* Jaimi's shared visual theme: joyful, calm and easy to scan. */
:root{
  --joy-yellow:#F7C948;--joy-yellow-soft:#FFF3B8;--joy-lilac:#A78BFA;--joy-lilac-soft:#EEE7FF;
  --joy-turquoise:#2EC4B6;--joy-turquoise-soft:#DDF8F4;--joy-pink:#C94F7C;--joy-pink-soft:#FBE3EC;
  --joy-cream:#FFF9EE;--joy-ink:#30263D;--paper:var(--joy-cream)!important;--paper-2:#FFFCF6!important;
  --card:#FFFFFF!important;--ink:var(--joy-ink)!important;--ink-soft:#675D70!important;--ink-faint:#94889E!important;
  --line:#E8DFF0!important;--line-soft:#F3EDF7!important;--coral:var(--joy-pink)!important;--mint:var(--joy-turquoise)!important;
  --sunshine:var(--joy-yellow)!important;--sky:var(--joy-turquoise)!important;--plum:var(--joy-lilac)!important;
  --good:#178A78;--warn:#B47700;--bad:#B83D68;
}
body{background:radial-gradient(circle at 8% 3%,rgba(247,201,72,.20),transparent 24rem),radial-gradient(circle at 96% 12%,rgba(167,139,250,.16),transparent 27rem),radial-gradient(circle at 55% 100%,rgba(46,196,182,.12),transparent 32rem),var(--paper)}
.card,.scard,.item,.acct,.bsec,.stat,.sheet{border-color:var(--line)!important;box-shadow:0 7px 22px rgba(72,50,90,.07)!important}
.card h2,.card-title,h1{color:var(--joy-ink)}.pills,.tabs{background:var(--joy-lilac-soft)!important}
.pills button.on,.tab.active{background:var(--joy-ink)!important;color:#fff!important}
.btn.dark,.btn-primary,.primary{background:linear-gradient(135deg,var(--joy-pink),#A83F73)!important;color:#fff!important}
.btn.soft,.btn-soft,.ghost{background:var(--joy-lilac-soft);border-color:#D9C9FA!important}
.bar>i,.progress>i{background:linear-gradient(90deg,var(--joy-turquoise),var(--joy-lilac),var(--joy-pink))!important}
.chip,.tagchip{border-radius:999px!important}.flag{border-left:5px solid var(--joy-yellow)!important}.em,.ico{filter:saturate(1.13)}
button:not(.close):not(.check):not(.chk):not(.rbox),.btn,.acct,.tab{min-height:44px}
button:active,.btn:active,.acct:active{transform:scale(.97)}
button:focus-visible,.btn:focus-visible,.acct:focus-visible{outline:3px solid rgba(167,139,250,.48)!important;outline-offset:2px}
input[type="checkbox"]:checked{accent-color:var(--joy-turquoise)}
@media (prefers-reduced-motion:no-preference){.card,.item,.acct,.btn,button{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}.card:hover{box-shadow:0 10px 28px rgba(72,50,90,.10)!important}input[type="checkbox"]:checked{animation:joy-pop .28s ease-out}@keyframes joy-pop{50%{transform:scale(1.28)}}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
@media(max-width:600px){.tiny{font-size:12px!important;letter-spacing:.035em!important}.card{padding:16px!important}}
```

## Raw Money Map source: `finance/money-map.css`

```css
.mm-map{font-size:14px}.mm-map strong,.mm-map span{display:block}.mm-income,.mm-node{padding:12px;border:1px solid var(--line,#ddd);border-radius:14px;background:var(--card,#fff);overflow-wrap:anywhere}.mm-income{background:var(--ink,#243447);color:#fff;text-align:center}.mm-income>b{font-size:24px;display:block;margin:5px}.mm-income span{font-size:12px;opacity:.9}.mm-node span{font-size:12px;margin-top:4px}.mm-loan{border-style:dashed}.mm-arrow{text-align:center;font-weight:700;margin:8px 0}.mm-arrow small{display:block;font-weight:400}.mm-branches{display:flex;flex-wrap:wrap;gap:12px;list-style:none;padding:0 0 0 14px;margin:8px 0;border-left:2px solid var(--line,#ddd)}.mm-branches>li{flex:1 1 170px;min-width:0}.mm-summary{border-radius:10px;padding:10px;background:var(--bg,#f5f3ef);font-size:12px}.mm-map summary,.mm-transfers summary{cursor:pointer;padding:12px 4px;min-height:24px;font-weight:700}.mm-transfers details+details{border-top:1px solid var(--line,#ddd)}.mm-map small,.mm-transfers small{font-size:12px}.mm-map :focus-visible,.mm-transfers :focus-visible{outline:3px solid var(--ink,#243447);outline-offset:3px}@media(max-width:520px){.mm-branches{display:block;padding-left:12px}.mm-branches>li{margin-bottom:12px}.mm-map{font-size:13px}}
.dash-row .card{height:auto!important;min-height:0}.dash-row{align-items:start}.info-btn{min-width:36px;min-height:36px}.btn:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--ink,#243447);outline-offset:3px}button,input,select,textarea{max-width:100%}.mm-estimate{font-size:12px;line-height:1.5;padding:10px;border:1px solid var(--line,#ddd);border-radius:12px;background:var(--bg,#f6f5f1)}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
```
