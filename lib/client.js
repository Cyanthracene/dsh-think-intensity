window.__ModuleLoader__.load({
	id: "dsh-think-intensity",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		// ────────────────────────────────────────────────────────────────
		// dsh-think-intensity — browser half (entry)
		//
		// The view lives in a package-local chunk (`./client.view.js`) because the
		// desktop shell serves this entry through a *combo* URL that Chromium caches
		// persistently: while a package's `client.js` revision does not change, its
		// bytes never refresh. A chunk request carries a `?rev=` query, so it always
		// revalidates and always picks up the current view code.
		//
		// One seat is registered: the compact chip in the composer tool row, beside
		// the official model selector. The panel-above-the-card seat is deliberately
		// not mounted — this control belongs next to the model selector, not in a
		// second full-width bar over the composer.
		// ────────────────────────────────────────────────────────────────

		var CHIP_SLOT = "conversation.input.right";
		var ENTRY_ID = "think-intensity";
		var CSS_TAG_ID = "dsh-think-intensity/dock.css";
		// Single quotes matter: the chunk channel slices off "./" and matches the
		// rest against /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/ — a double quote
		// becomes part of the URL and the request goes to a path that is not this.
		var VIEW_CHUNK = './client.view.js';

		// ── styles ────────────────────────────────────────────────────────
		var CSS = [
			".ti-root{position:relative;display:flex;flex-direction:column;align-items:flex-start;",
			"width:100%;margin:8px 0 4px;font-family:inherit;font-size:13px;line-height:20px;",
			"color:var(--dsw-alias-label-primary);box-sizing:border-box}",
			".ti-root *{box-sizing:border-box}",

			// The composer-input-row chip (compact seat).
			".ti-slot{position:relative;display:inline-flex;align-items:center;min-width:0}",
			".ti-chip{display:inline-flex;align-items:center;gap:7px;max-width:100%;height:28px;padding:0 9px;",
			"border-radius:var(--dsw-radius-sm,8px);cursor:pointer;border:1px solid transparent;background:0 0;",
			"color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;",
			"transition:border-color .2s ease,background .2s ease,color .2s ease}",
			".ti-chip:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
			".ti-chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
			".ti-chip[aria-expanded='true']{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
			".ti-chip-label{font-size:12px;letter-spacing:.04em;white-space:nowrap;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}",
			".ti-chip-value{font-weight:600;white-space:nowrap;color:var(--dsw-alias-label-primary)}",
			".ti-chip-meter{display:inline-flex;align-items:center;gap:2px}",
			".ti-chip-dot{width:4px;height:4px;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent)}",
			".ti-chip-dot[data-on='true']{background:var(--ti-glow,rgba(61,220,255,.9));box-shadow:0 0 5px 1px var(--ti-glow,rgba(61,220,255,.7))}",

			// The floating panel opened from the chip.
			".ti-pop{position:absolute;right:0;bottom:calc(100% + 8px);z-index:1200;width:320px;max-width:min(320px,90vw);",
			"padding:12px;border-radius:14px;box-shadow:var(--dsw-elevation-prominent,0 10px 30px rgba(0,0,0,.35));",
			"background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));",
			"border:1px solid var(--dsw-alias-border-l1)}",

			// The panel above the composer card.
			".ti-card{position:relative;display:flex;align-items:center;gap:14px;width:100%;min-width:0;",
			"height:56px;padding:0 16px;border-radius:16px;overflow:hidden;isolation:isolate;",
			"border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);",
			"transition:border-color .25s ease,box-shadow .35s ease,background .35s ease}",
			".ti-card::before{content:'';position:absolute;inset:-40%;z-index:-2;pointer-events:none;opacity:0;",
			"background:conic-gradient(from 0deg,#ff4d6d,#ffd166,#7bff8a,#3ddcff,#7a5cff,#ff4dd2,#ff4d6d);",
			"animation:ti-spin 6s linear infinite;transition:opacity .45s ease}",
			".ti-card::after{content:'';position:absolute;inset:1px;z-index:-1;border-radius:15px;pointer-events:none;",
			"background:var(--dsw-alias-bg-layer-1);transition:opacity .45s ease}",
			".ti-card[data-max='true']{border-color:transparent;",
			"box-shadow:0 0 0 1px rgba(255,255,255,.10),0 10px 34px -10px rgba(122,92,255,.65),0 0 60px -18px rgba(61,220,255,.6)}",
			".ti-card[data-max='true']::before{opacity:1}",
			".ti-card[data-max='true']::after{opacity:.87}",
			".ti-dock[data-max='true'] .ti-label,.ti-dock[data-max='true'] .ti-readout{color:transparent;",
			"background:linear-gradient(90deg,#ff4d6d,#ffd166,#7bff8a,#3ddcff,#7a5cff,#ff4dd2,#ff4d6d);",
			"background-size:300% 100%;-webkit-background-clip:text;background-clip:text;animation:ti-flow 3s linear infinite}",
			".ti-dock[data-max='true'] .ti-readout{font-weight:600;animation-duration:2.2s}",
			".ti-head{display:flex;align-items:center;gap:8px;flex:0 0 auto;user-select:none}",
			".ti-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;",
			"color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));transition:color .3s ease}",

			// The track: a short, thick rail. It fills whatever row holds it, and every
			// level gets a slot of its own so the thumb never dead-ends at the ends.
			".ti-slider{position:relative;flex:0 0 auto;width:100%;height:44px;display:flex;align-items:center;",
			"touch-action:none;user-select:none}",
			".ti-pop .ti-slider{margin-top:2px}",
			".ti-track{position:relative;width:100%;height:30px;border-radius:999px;",
			"background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);",
			"box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}",
			".ti-fill{position:absolute;left:0;top:0;height:100%;width:var(--ti-pct,0%);border-radius:999px;",
			"background:linear-gradient(90deg,#3ddcff,#7a5cff);",
			"box-shadow:0 0 12px 1px var(--ti-glow,rgba(61,220,255,.55));",
			"transition:width .16s cubic-bezier(.22,1.2,.36,1),background .35s ease,box-shadow .35s ease}",
			".ti-dock[data-dragging='true'] .ti-fill{transition:none}",
			// At the top level the fill itself becomes a rainbow ribbon that flows.
			".ti-dock[data-max='true'] .ti-fill{background:linear-gradient(90deg,#ff2d55,#ff9f0a,#ffd60a,#32d74b,",
			"#0ac8ff,#5e5ce6,#ff2d9b,#ff2d55);background-size:400% 100%;animation:ti-flow 1.4s linear infinite;",
			"box-shadow:0 0 18px 4px rgba(255,255,255,.45),0 0 40px 12px rgba(122,92,255,.55)}",
			".ti-shine{position:absolute;inset:0;mix-blend-mode:screen;border-radius:999px;",
			"background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.7) 50%,transparent 80%);",
			"background-size:220% 100%;animation:ti-shine 2.6s linear infinite}",
			".ti-dock[data-max='true'] .ti-shine{background-size:150% 100%;animation:ti-shine 1.1s linear infinite}",
			".ti-ticks{position:absolute;left:0;right:0;top:0;height:100%;display:flex;pointer-events:none}",
			".ti-tick{flex:1 1 0;display:flex;align-items:center;justify-content:center}",
			".ti-tick i{width:2px;height:7px;border-radius:2px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent)}",

			// Pointer surface: the drag handler. The range input keeps the keyboard and
			// the accessible name but never intercepts the pointer.
			".ti-pointer{position:absolute;inset:-8px 0;z-index:3;cursor:grab;touch-action:none}",
			".ti-dock[data-dragging='true'] .ti-pointer{cursor:grabbing}",
			".ti-input{position:absolute;width:1px;height:1px;opacity:0;margin:0;pointer-events:none;clip-path:inset(50%)}",
			".ti-slider[data-disabled='true'] .ti-pointer{cursor:not-allowed}",
			".ti-slider[data-disabled='true'] .ti-fill{background:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent);box-shadow:none}",
			".ti-slider[data-disabled='true'] .ti-shine{display:none}",

			// A chunky oval grip that sits comfortably inside the rail's 30px band.
			".ti-thumb{position:absolute;top:50%;left:var(--ti-pct,0%);width:30px;height:26px;margin:-13px 0 0 -15px;",
			"border-radius:999px;z-index:2;pointer-events:none;transform:scale(var(--ti-thumb-scale,1));",
			"transition:left .16s cubic-bezier(.22,1.2,.36,1),transform .18s ease}",
			".ti-dock[data-dragging='true'] .ti-thumb{transition:transform .18s ease}",
			".ti-thumb-core{position:absolute;inset:4px;border-radius:999px;background:#fff;",
			"box-shadow:0 0 8px 2px var(--ti-glow,rgba(122,92,255,.85)),0 0 18px 6px color-mix(in srgb,var(--ti-glow) 60%,transparent)}",
			".ti-thumb-ring{position:absolute;inset:-4px;border-radius:999px;opacity:.7;",
			"border:1.5px solid var(--ti-glow,rgba(122,92,255,.85));animation:ti-ring 1.9s ease-out infinite}",

			".ti-particles{position:absolute;left:0;top:50%;width:var(--ti-pct,0%);height:44px;margin-top:-22px;pointer-events:none;",
			"transition:width .16s cubic-bezier(.22,1.2,.36,1)}",
			".ti-dock[data-dragging='true'] .ti-particles{transition:none}",
			".ti-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#dff6ff;opacity:.06;",
			"box-shadow:0 0 6px 2px var(--ti-glow,rgba(61,220,255,.9));animation:ti-spark 2.1s ease-in-out infinite;",
			"transition:opacity .4s ease}",

			// Max-level overdrive layers (no bottom hairline: it read as an artefact).
			// The sweep is deliberately loud: a saturated band, a faster cycle and a
			// second band travelling the other way, so the top level is unmistakable.
			".ti-overdrive{position:absolute;inset:0;border-radius:16px;pointer-events:none;opacity:0;mix-blend-mode:screen;",
			"background:linear-gradient(100deg,transparent 8%,rgba(255,45,85,.55) 24%,rgba(255,159,10,.55) 36%,rgba(255,214,10,.5) 46%,rgba(50,215,75,.5) 58%,rgba(10,200,255,.55) 70%,rgba(94,92,230,.55) 82%,transparent 94%);",
			"background-size:260% 100%;transition:opacity .5s ease}",
			".ti-dock[data-max='true'] .ti-overdrive{opacity:1;animation:ti-flow 1.8s linear infinite}",
			".ti-dock[data-max='true'] .ti-overdrive::after{content:'';position:absolute;inset:0;border-radius:inherit;",
			"background:linear-gradient(260deg,transparent 10%,rgba(255,255,255,.30) 30%,transparent 46%,rgba(255,255,255,.22) 66%,transparent 84%);",
			"background-size:220% 100%;animation:ti-flow 2.4s linear infinite reverse}",
			".ti-grid-glow{position:absolute;inset:-14px;border-radius:28px;pointer-events:none;opacity:0;filter:blur(10px);",
			"background:radial-gradient(60% 120% at 50% 50%,color-mix(in srgb,var(--ti-glow) 34%,transparent),transparent 72%);",
			"transition:opacity .55s ease}",
			".ti-dock[data-max='true'] .ti-grid-glow{opacity:1;animation:ti-breathe 2.8s ease-in-out infinite}",
			".ti-rainbow-spark{position:absolute;left:var(--ti-pct,0%);width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;",
			"pointer-events:none;opacity:0;background:conic-gradient(#ff4d6d,#ffd166,#7bff8a,#3ddcff,#7a5cff,#ff4dd2,#ff4d6d);",
			"box-shadow:0 0 10px 3px rgba(255,255,255,.5);transition:opacity .4s ease}",
			".ti-dock[data-max='true'] .ti-rainbow-spark{opacity:1;animation:ti-flare 1.1s ease-out infinite}",

			".ti-readout{flex:0 0 auto;min-width:58px;text-align:right;font-size:12px;",
			"color:var(--dsw-alias-label-secondary);transition:color .3s ease}",
			".ti-badge{flex:0 0 auto;font-size:10px;letter-spacing:.14em;padding:2px 8px;border-radius:999px;white-space:nowrap;",
			"border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);",
			"color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));transition:all .3s ease}",
			".ti-dock[data-max='true'] .ti-badge{color:#0b0b12;border-color:transparent;font-weight:700;",
			"background:linear-gradient(90deg,#ffd166,#7bff8a,#3ddcff,#ff4dd2);background-size:300% 100%;animation:ti-flow 3s linear infinite}",
			".ti-state{flex:0 1 auto;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
			"color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary))}",
			".ti-state[data-kind='error']{color:var(--dsw-alias-state-error-primary)}",
			".ti-dock[data-busy='true'] .ti-state{opacity:.7}",
			".ti-anchor{position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none}",
			".ti-hint{font-size:11px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));margin-top:6px}",
			".ti-hint[data-kind='error']{color:var(--dsw-alias-state-error-primary)}",
			".ti-hint[data-kind='ok']{color:var(--dsw-alias-state-success-primary)}",
			".ti-hint-trace{opacity:.8;font-variant-numeric:tabular-nums}",
			// The ladder strip: one cell per declared level, lit where the aura renders.
			".ti-ladder{display:flex;align-items:center;gap:4px;width:100%;margin-top:6px}",
			".ti-ladder-cell{flex:1 1 0;height:4px;border-radius:999px;",
			"background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);",
			"transition:background .35s ease,box-shadow .35s ease,transform .2s ease}",
			".ti-ladder-cell[data-lit='true']{background:linear-gradient(90deg,#3ddcff,#7a5cff)}",
			".ti-ladder-cell[data-here='true']{transform:scaleY(2.2)}",
			".ti-ladder-cell i{display:block;height:100%;border-radius:999px}",
			".ti-ladder-cell[data-lit='true'][data-here='true']{box-shadow:0 0 10px 2px var(--ti-glow,rgba(61,220,255,.6))}",

			// The effect switches. A chip is a button, and the dot is a state readout
			// rather than the target, so the whole chip is clickable.
			".ti-switches{display:flex;flex-wrap:wrap;align-items:center;gap:5px;width:100%;margin-top:8px}",
			".ti-switch{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;",
			"border-radius:999px;cursor:pointer;font:inherit;font-size:11px;line-height:1;",
			"border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);",
			"background:transparent;color:var(--dsw-alias-label-secondary);",
			"transition:border-color .2s ease,background .2s ease,color .2s ease}",
			".ti-switch:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
			".ti-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
			".ti-switch-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;",
			"background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-label-primary) 35%,transparent);",
			"transition:background .2s ease,box-shadow .2s ease}",
			".ti-switch[data-on='true']{color:var(--dsw-alias-label-primary);",
			"border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent)}",
			".ti-switch[data-on='true'] .ti-switch-dot{background:var(--ti-glow,rgba(61,220,255,.9));",
			"box-shadow:0 0 7px 1px var(--ti-glow,rgba(61,220,255,.7))}",
			".ti-switch[data-master='true']{font-weight:600}",
			".ti-switch[data-master='true'][data-on='false']{border-style:dashed;opacity:.85}",
			// `data-locked` is kept so a future mode could lock a key without new CSS, but NO
			// mode locks the sub-keys now: a locked key cannot arm the selection that custom
			// mode will use, and it hid a real bug behind "the key does nothing anyway".
			".ti-switch[data-locked='true']{cursor:not-allowed;opacity:.55}",
			".ti-switch[data-locked='true'] .ti-switch-dot{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-label-primary) 28%,transparent)}",
			// In default mode the lamps are a readout of the rung rather than controls, so they
			// are drawn solid and without a hover affordance.
			".ti-switches[data-from-rung='true'] .ti-switch:not([data-master='true']){cursor:default}",
			// The mode key colour-codes its three states, so the head of the row says which
			// of the two primary keys is in charge before the label is read.
			".ti-switch[data-state='default']{border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 34%,transparent)}",
			".ti-switch[data-state='custom']{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,transparent)}",
			// A sub-key that the mode key is overriding is drawn muted: a checked box in
			// A sub-key the mode key is overriding is drawn muted.
			".ti-switch[data-live='false']:not([data-master='true']){opacity:.55}",
			".ti-switch[data-live='false']:not([data-master='true']) .ti-switch-dot{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent)}",
			// Checked but not rendering: the mode key is supplying nothing, so the lamp is
			// drawn HOLLOW rather than dark. That third state is what tells the user their
			// selection was kept instead of thrown away.
			".ti-switch[data-suppressed='true']{opacity:.75}",
			".ti-switch[data-suppressed='true'] .ti-switch-dot{background:transparent;",
			"box-shadow:inset 0 0 0 1.5px var(--ti-glow,rgba(61,220,255,.9))}",
			// The whole panel dims when the effects are off, which is the visual half of
			// "off means off": the rail and the ladder stay readable but stop advertising.
			".ti-pop[data-effects='off'] .ti-ladder-cell{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}",
			".ti-pop[data-effects='off'] .ti-ladder-cell[data-lit='true']{background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);box-shadow:none}",
			".ti-pop[data-effects='off'] .ti-slider{opacity:.75}",
			// Custom mode is visually distinct from both ends, so the mode is readable from
			// the panel chrome alone.
			".ti-pop[data-effects='custom'] .ti-ladder-cell[data-lit='true']{background:linear-gradient(90deg,#3ddcff,#7a5cff)}",

			// The composer card takes the overdrive too: a thicker rotating rim, a faster
			// cycle, and a saturated bloom so the whole input box reads as "on".
			".ti-card-overlay{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;overflow:hidden}",
			".ti-card-overlay::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:2.2px;",
			"background:conic-gradient(from 0deg,#ff2d55,#ff9f0a,#ffd60a,#32d74b,#0ac8ff,#5e5ce6,#ff2d9b,#ff2d55);",
			"-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;",
			"mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;",
			"animation:ti-spin 3s linear infinite}",
			".ti-card-overlay::after{content:'';position:absolute;inset:0;border-radius:inherit;animation:ti-breathe 2.2s ease-in-out infinite;",
			"background:radial-gradient(120% 160% at 50% 120%,rgba(255,45,85,.30),transparent 62%),",
			"radial-gradient(120% 160% at 10% -20%,rgba(10,200,255,.32),transparent 62%),",
			"radial-gradient(120% 160% at 90% -20%,rgba(94,92,230,.34),transparent 62%)}",

			// ── ambient full-screen aura, one character per level ─────────
			// This is the RESIDENT layer: it stays on screen for as long as a level is
			// selected, so the selected thinking intensity is readable at a glance
			// without touching the control.
			//
			// Design constraints it obeys:
			//   * never busy — the strongest tier peaks at 0.26 alpha under `screen`
			//     blending, and every tier keeps the middle of the screen clear;
			//   * one distinguishable character per tier, not one look at five
			//     brightnesses: mist, aurora, aurora + dust, and finally the rainbow;
			//   * no hard edges anywhere, so nothing on screen competes with the text.
			//
			// Same load-bearing rule as the burst: EVERY layer declares its resting
			// state (`opacity:0`) and keeps its geometry inside the animation, so a
			// layer whose animation is not running is invisible rather than parked.
			//
			// TWO THINGS HERE ARE LOAD-BEARING, and both were learned the hard way:
			//
			//   * `z-index: 1`, not 0 and not negative. At 0 the aura sits UNDER the
			//     shell's own opaque surfaces, so it is covered rather than "behind"; a
			//     negative index is worse — it lands behind the application background.
			//     One positive step puts it above the background and below the panels.
			//
			//   * NORMAL compositing, no `mix-blend-mode`. This is the fix for "too
			//     dark": `screen` on a near-black surface is `src * (1 - dst)`, i.e.
			//     about a 5% multiplier, so a 0.3-alpha layer landed as ~1.5% — invisible
			//     no matter how far the alpha was raised. Compositing normally makes the
			//     tier's alpha the number actually painted.
			//
			// The softness now comes from the gradients and the blur, and the "out of
			// the way" property comes from being edge-weighted: every gradient is
			// anchored in the outer band of the viewport and the reading area in the
			// middle is left clear.
			// `contain` keeps the effect from invalidating the shell's layout, and the layer
			// must NOT declare `will-change`: that promotes all four full-viewport layers on
			// top of the hundreds of animated shapes inside them, which is what buried the
			// compositor and produced a flashing screen. The layers animate opacity, which
			// the compositor handles without a forced promotion.
			".ti-amb{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;contain:strict;",
			"opacity:0;transition:opacity .9s ease}",
			".ti-amb[data-on='true']{opacity:1}",
			".ti-amb-layer{position:absolute;inset:0;opacity:0;pointer-events:none;",
			"transition:opacity .7s ease}",

			// ── the four effects, each unlocked by one more rung ──────────
			// The lesson from the wash experiments: a broad low-alpha gradient cannot be
			// read on a dark theme, no matter how far the alpha is raised — it just turns
			// into a film over the wallpaper. Everything below is therefore a SHAPE that
			// MOVES: discrete motes, expanding rings, travelling bands, drifting sheets.
			// Structure is what makes an effect visible; opacity alone never was.

			// 1. Motes: the baseline rung. Discrete points, so they read at any alpha.
			".ti-amb-motes{opacity:0}",
			".ti-amb-mote{position:absolute;left:var(--mx,50%);top:var(--my,50%);width:var(--ms,3px);height:var(--ms,3px);",
			"border-radius:50%;background:#fff;opacity:0;",
			"box-shadow:0 0 8px 2px var(--ti-glow,rgba(120,190,255,.9));",
			"animation:ti-amb-mote var(--md,9s) linear infinite;animation-delay:var(--mdl,0s)}",
			"@keyframes ti-amb-mote{0%{transform:translate3d(0,8vh,0) scale(.5);opacity:0}",
			"12%{opacity:var(--mo,.8)}55%{opacity:calc(var(--mo,.8) * .8)}",
			"88%{opacity:calc(var(--mo,.8) * .3)}100%{transform:translate3d(var(--mxd,12px),-92vh,0) scale(1);opacity:0}}",

			// 2. Rings: three seeds pulsing outward. Crisp strokes, no blur.
			".ti-amb-rings{opacity:0}",
			".ti-amb-ring{position:absolute;left:var(--rx,50%);top:var(--ry,50%);width:220px;height:220px;",
			"margin:-110px 0 0 -110px;border-radius:50%;border:2px solid rgba(var(--ti-amb-a,150,225,255),.9);",
			"opacity:0;box-shadow:0 0 22px 4px rgba(var(--ti-amb-a,150,225,255),.45);",
			"animation:ti-amb-ring var(--rd,5s) cubic-bezier(.18,.8,.3,1) infinite;animation-delay:var(--rdl,0s)}",
			"@keyframes ti-amb-ring{0%{transform:scale(.12);opacity:0}",
			"10%{opacity:var(--ro,.75)}100%{transform:scale(var(--rscale,7));opacity:0}}",

			// 3. Sweeps: counter-travelling light bands.
			//
			// BLUR IS DILUTION, and this is where it hurt most: at 26px over a 26vh band
			// the energy spread so far that the peak never rose above its surroundings,
			// which is why the sweeps read as "not really there". The radius is small now,
			// so the band keeps a bright core and only its EDGES are soft.
			//
			// SHAPE is the other half. A rectangle sliding horizontally reads as a rigid
			// bar, which is what "直来直去" describes. So each band is:
			//   * thin (10-16vh) and shaped like a lens, via an asymmetric border-radius,
			//   * tilted, and the tilt SWINGS as it travels, so its path curves,
			//   * RIPPLING: the horizontal travel is modulated by a three-quarter sine on
			//     Y, so the band undulates like a water surface instead of sliding along a
			//     rail. The rotation oscillates on a different count over the same loop,
			//     which keeps the motion from ever looking periodic.
			//
			// The tilt and the amplitude come in as variables: the keyframes own
			// `transform`, so an inline `transform` would simply be overridden.
			".ti-amb-sweeps{opacity:0}",
			".ti-amb-sweep{position:absolute;left:-45%;right:-45%;height:var(--sh,12vh);",
			"border-radius:50% 12% 50% 12%;",
			"background:linear-gradient(100deg,transparent 20%,rgba(var(--ti-amb-a,150,225,255),.85) 38%,",
			"rgba(255,255,255,.95) 50%,rgba(var(--ti-amb-c,170,190,255),.85) 62%,transparent 80%);",
			"filter:blur(5px);opacity:0;animation:ti-amb-sweep var(--sd,13s) linear infinite;",
			"animation-delay:var(--sdl,0s);animation-direction:var(--sdir,normal)}",
			"@keyframes ti-amb-sweep{",
			"0%{transform:translate3d(-52%,calc(var(--samp,4vh) * -1),0) rotate(var(--st0,-7deg));opacity:0}",
			"8%{opacity:var(--so,.85)}",
			"20%{transform:translate3d(-31%,0,0) rotate(var(--stm,-3deg))}",
			"37%{transform:translate3d(-11%,var(--samp,4vh),0) rotate(var(--st1,5deg))}",
			"50%{transform:translate3d(0,calc(var(--samp,4vh) * .15),0) rotate(var(--stm,-3deg))}",
			"66%{transform:translate3d(17%,calc(var(--samp,4vh) * -.7),0) rotate(var(--st1,5deg))}",
			"83%{transform:translate3d(36%,calc(var(--samp,4vh) * .55),0) rotate(var(--st0,-7deg))}",
			"92%{opacity:var(--so,.85)}",
			"100%{transform:translate3d(52%,0,0) rotate(var(--stm,-3deg));opacity:0}}",

			// 4. Aurora: drifting sheets, the richest rung. Blur is on the SHEETS, not on
			// the layer: a 34px filter over the whole layer flattened every sheet inside
			// it, so the sheets now carry their own small radius and keep a visible body.
			".ti-amb-aurora{opacity:0}",
			".ti-amb-sheet{position:absolute;left:-45%;right:-45%;height:34vh;border-radius:46%;",
			"opacity:0;filter:blur(14px);",
			"animation:ti-amb-drift var(--ad,22s) ease-in-out infinite;animation-delay:var(--adl,0s)}",
			// The tilt is composed INTO the keyframes: an inline `transform` would be
			// overridden by them, so the per-sheet `--atilt` variable is folded in here.
			"@keyframes ti-amb-drift{0%,100%{transform:translate3d(-11%,0,0) scaleY(1) rotate(var(--atilt,0deg))}",
			"50%{transform:translate3d(11%,-4%,0) scaleY(1.3) rotate(var(--atilt,0deg))}}",

			// The rungs.
			//
			// NOTE THE TWO SEPARATE AXES, because conflating them caused a lot of churn:
			//
			//   DENSITY  (how many shapes)  is per-tier in JS: 40 -> 52+3 -> 64+4+2 -> 76+5+3+3
			//   BRIGHTNESS (how strongly they glow) is FLAT, and the rules below only exist to
			//   OVERRIDE the resting `opacity:0` on each pool.
			//
			// Brightness used to ramp as well (`.9` at rung 1, and a pool only lit once its
			// rung arrived), which made a low level look washed out next to max. Every pool
			// that has any shapes at all now renders at FULL opacity, so the only difference
			// between levels is how much structure is on screen — never how bright it is.
			//
			// These rules are also what makes CUSTOM mode full-brightness at every level: the
			// pools are filled from a flat maximum there, so the moment a box is ticked its
			// pool is non-empty and lands on one of these full-opacity rules.
			".ti-amb[data-lv='1'] .ti-amb-motes{opacity:1}",
			".ti-amb[data-lv='2'] .ti-amb-motes{opacity:1}",
			".ti-amb[data-lv='2'] .ti-amb-rings{opacity:1}",
			".ti-amb[data-lv='3'] .ti-amb-motes{opacity:1}",
			".ti-amb[data-lv='3'] .ti-amb-rings{opacity:1}",
			".ti-amb[data-lv='3'] .ti-amb-sweeps{opacity:1}",
			".ti-amb[data-lv='4'] .ti-amb-motes{opacity:1}",
			".ti-amb[data-lv='4'] .ti-amb-rings{opacity:1}",
			".ti-amb[data-lv='4'] .ti-amb-sweeps{opacity:1}",
			".ti-amb[data-lv='4'] .ti-amb-aurora{opacity:1}",
			".ti-amb[data-lv='5'] .ti-amb-motes{opacity:1}",
			".ti-amb[data-lv='5'] .ti-amb-rings{opacity:1}",
			".ti-amb[data-lv='5'] .ti-amb-sweeps{opacity:1}",
			".ti-amb[data-lv='5'] .ti-amb-aurora{opacity:1}",
			// Custom mode may light ANY combination, including pools the rung ladder never
			// reaches at the level the slider is on (rings at the bottom of the ladder, for
			// instance). So custom mode lights every non-empty pool unconditionally: the
			// density there is already the flat maximum, and the brightness must match it.
			//
			// `:not(:empty)` is what keeps a pool with zero shapes dark, so unticking a box
			// still removes its effect completely.
			".ti-amb[data-custom='true'] .ti-amb-layer:not(:empty){opacity:1}",

			// Reduced motion: the shapes stay, the travel stops. A stopped shape is still
			// a visible effect, which is the point — cancelling the animation alone used
			// to zero every layer, because their opacity lived only in the keyframes.
			"@media (prefers-reduced-motion:reduce){.ti-amb-mote,.ti-amb-ring,.ti-amb-sweep,.ti-amb-sheet{animation:none!important}",
			".ti-amb .ti-amb-mote{opacity:.55}",
			".ti-amb .ti-amb-ring{opacity:.5;transform:scale(2.4)}",
			".ti-amb .ti-amb-sweep{opacity:.5}",
			".ti-amb .ti-amb-sheet{opacity:.55}",
			".ti-amb[data-on='true']{opacity:1}}",

			// ── full-viewport level-crossing shockwave ─────────────────────
			// A level crossing fires three stacked rings plus a wall flash from the
			// pointer's position. The nodes are created ONCE and replayed by toggling
			// the animation, so dragging back and forth over a boundary can fire
			// without bound: no node churn, no layout work.
			//
			// EVERY layer declares its resting state as `opacity:0` and keeps all of
			// its geometry inside the animation. That is load-bearing: a layer whose
			// only `opacity` lived in the keyframes rendered at full size and full
			// opacity whenever the animation was not running, which is exactly how a
			// 200px blurred core ended up parked over the composer.
			//
			// FORCE IS A FUNCTION OF THE LEVEL. One set of keyframes plus per-firing
			// custom properties: the level sets the count, the reach, the brightness,
			// the duration and the wall flash, so a crossing gets visibly heavier as
			// the ladder goes up. Nothing here decides which layers exist — the view
			// owns the spawn table and only the layers it fills have an animation.
			".ti-ion{position:fixed;left:0;top:0;width:0;height:0;z-index:2147482000;pointer-events:none}",
			// The wall wash: a wide, saturated bloom plus a hard specular hotspot right
			// at the pointer. The hotspot is what makes a crossing read as an impact
			// rather than a soft gradient.
			".ti-ion-splash{position:fixed;inset:0;pointer-events:none;opacity:0;",
			"background:radial-gradient(circle calc(var(--ti-ion-reach,58vmax) * .30) at var(--ti-ion-x,50%) var(--ti-ion-y,50%),",
			"rgba(255,255,255,var(--ti-ion-flash,.42)) 0%,transparent 62%),",
			"radial-gradient(circle var(--ti-ion-reach,58vmax) at var(--ti-ion-x,50%) var(--ti-ion-y,50%),",
			"rgba(var(--ti-ion-a,120,180,255),var(--ti-ion-sa,.22)) 0%,",
			"rgba(var(--ti-ion-b,90,120,255),calc(var(--ti-ion-sa,.22) * .78)) 26%,",
			"rgba(var(--ti-ion-c,200,90,255),calc(var(--ti-ion-sa,.22) * .52)) 46%,transparent 74%)}",
			// The beam: a hairline that shoots out from the pointer and is drawn back in.
			".ti-ion-beam{position:fixed;left:var(--ti-ion-x,50%);top:var(--ti-ion-y,50%);width:3px;height:3px;",
			"opacity:0;transform:scale(var(--ti-ion-reach-scale,8));border-radius:3px;",
			"background:linear-gradient(90deg,transparent,rgba(255,255,255,.9) 55%,rgb(var(--ti-ion-a,120,180,255)));",
			"box-shadow:0 0 16px 5px rgba(var(--ti-ion-a,120,180,255),.8),0 0 34px 12px rgba(var(--ti-ion-a,120,180,255),.4)}",
			// The core: a white-hot centre with a wide saturated halo and a real light
			// spill, so it genuinely lights the surface behind it.
			".ti-ion-core{position:fixed;left:var(--ti-ion-x,50%);top:var(--ti-ion-y,50%);width:220px;height:220px;",
			"margin:-110px 0 0 -110px;border-radius:50%;opacity:0;transform:scale(.25);filter:blur(6px);",
			"background:radial-gradient(circle,rgba(255,255,255,.97) 0%,rgba(255,255,255,var(--ti-ion-core-a,.55)) 14%,",
			"rgba(var(--ti-ion-a,120,180,255),.75) 34%,",
			"rgba(var(--ti-ion-c,200,90,255),.45) 56%,transparent 76%)}",

			// One ring family. The slot decides the diameter and which keyframes it
			// runs; the level decides how far it travels and how long it takes.
			//
			// Each ring is THREE stacked surfaces, which is what gives it a shockwave
			// front instead of a thin outline:
			//   ::before - a white-hot leading edge, offset so the front is white
			//   the ring - a saturated chroma body with a real light spill
			//   ::after  - a light, wide highlight filling the ring's interior
			".ti-ion-ring,.ti-ion-ring2,.ti-ion-ring3,.ti-ion-ring4{position:fixed;",
			"left:var(--ti-ion-x,50%);top:var(--ti-ion-y,50%);border-radius:50%;opacity:0;transform:scale(.16);",
			"border:var(--ti-ion-weight,3px) solid rgb(var(--ti-ion-a,120,180,255));",
			"background:radial-gradient(circle,transparent 52%,",
			"rgba(var(--ti-ion-a,120,180,255),.30) 70%,rgba(var(--ti-ion-c,200,90,255),.55) 92%,transparent 100%);",
			"box-shadow:0 0 30px 12px rgba(var(--ti-ion-a,120,180,255),var(--ti-ion-ring-a,.55)),",
			"0 0 90px 34px rgba(var(--ti-ion-c,200,90,255),calc(var(--ti-ion-ring-a,.55) * .5)),",
			"inset 0 0 34px 10px rgba(var(--ti-ion-a,120,180,255),.55)}",
			".ti-ion-ring::before,.ti-ion-ring2::before,.ti-ion-ring3::before,.ti-ion-ring4::before{content:'';",
			"position:absolute;inset:calc(var(--ti-ion-weight,3px) * -1.9);border-radius:50%;",
			"border:calc(var(--ti-ion-weight,3px) * 1.1) solid rgba(255,255,255,.92);",
			"box-shadow:0 0 22px 8px rgba(255,255,255,.75),inset 0 0 18px 6px rgba(255,255,255,.55)}",
			".ti-ion-ring::after,.ti-ion-ring2::after,.ti-ion-ring3::after,.ti-ion-ring4::after{content:'';",
			"position:absolute;inset:0;border-radius:50%;",
			"background:radial-gradient(circle,rgba(var(--ti-ion-b,90,120,255),.40) 0%,",
			"rgba(var(--ti-ion-a,120,180,255),.22) 55%,transparent 78%)}",
			".ti-ion-ring{width:84px;height:84px;margin:-42px 0 0 -42px}",
			".ti-ion-ring2{width:130px;height:130px;margin:-65px 0 0 -65px}",
			".ti-ion-ring3{width:190px;height:190px;margin:-95px 0 0 -95px}",
			".ti-ion-ring4{width:262px;height:262px;margin:-131px 0 0 -131px}",
			// The white-hot leading edge: one neutral ring per firing, expanding on its
			// own timeline so the wave front always outruns the colour behind it.
			".ti-ion-flashring{position:fixed;left:var(--ti-ion-x,50%);top:var(--ti-ion-y,50%);",
			"width:230px;height:230px;margin:-115px 0 0 -115px;border-radius:50%;opacity:0;",
			"transform:scale(.2);border:var(--ti-ion-front,4px) solid #fff;",
			"box-shadow:0 0 34px 16px rgba(255,255,255,.85),0 0 110px 44px rgba(255,255,255,.45),",
			"inset 0 0 30px 12px rgba(255,255,255,.7)}",
			// Terminal scale and duration both read from the level, so the same
			// keyframes cover "a tap" through "a full-screen detonation".
			"@keyframes ti-ion-ring{0%{transform:scale(.16);opacity:0}",
			"12%{transform:scale(.4);opacity:var(--ti-ion-ring-a,.95)}",
			"100%{transform:scale(var(--ti-ion-ring-end,22));opacity:0}}",
			"@keyframes ti-ion-ring-alt{0%{transform:scale(.16);opacity:0}",
			"22%{transform:scale(.36);opacity:var(--ti-ion-ring-a,.8)}",
			"100%{transform:scale(var(--ti-ion-ring-end,16));opacity:0}}",
			// The white front: starts as a bright disc and ends as a ring far outside
			// the frame, so what you see is a wall of light sweeping outward.
			"@keyframes ti-ion-front{0%{transform:scale(.14);opacity:0}",
			"9%{transform:scale(.34);opacity:var(--ti-ion-front-a,.98)}",
			"38%{opacity:calc(var(--ti-ion-front-a,.98) * .55)}",
			"100%{transform:scale(calc(var(--ti-ion-ring-end,22) * 1.18));opacity:0}}",
			"@keyframes ti-ion-core{0%{transform:scale(.25);opacity:0}",
			"18%{transform:scale(var(--ti-ion-core-peak,.9));opacity:1}100%{transform:scale(2.2);opacity:0}}",
			"@keyframes ti-ion-beam{0%{opacity:0;transform:scale(.6,.6) rotate(var(--ti-ion-beam-rot,0deg))}",
			"14%{opacity:1}100%{opacity:0;transform:scale(var(--ti-ion-beam-end,34),1) rotate(var(--ti-ion-beam-rot,0deg))}}",
			"@keyframes ti-ion-splash{0%{opacity:0}12%{opacity:1}100%{opacity:0}}",
			// `[data-arm]` gates the animation, so an arming decision made at fire time
			// takes effect on the very next frame without touching the stylesheet.
			".ti-ion[data-run] .ti-ion-ring[data-arm]{animation:ti-ion-ring var(--ti-ion-dur,.62s) cubic-bezier(.16,.84,.3,1) both}",
			".ti-ion[data-run] .ti-ion-ring2[data-arm]{animation:ti-ion-ring-alt calc(var(--ti-ion-dur,.62s) * 1.25) cubic-bezier(.16,.84,.3,1) both}",
			".ti-ion[data-run] .ti-ion-ring3[data-arm]{animation:ti-ion-ring calc(var(--ti-ion-dur,.62s) * 1.5) cubic-bezier(.16,.84,.3,1) both}",
			".ti-ion[data-run] .ti-ion-ring4[data-arm]{animation:ti-ion-ring-alt calc(var(--ti-ion-dur,.62s) * 1.75) cubic-bezier(.16,.84,.3,1) both}",
			".ti-ion[data-run] .ti-ion-core{animation:ti-ion-core var(--ti-ion-core-dur,.44s) ease-out both}",
			".ti-ion[data-run] .ti-ion-beam{animation:ti-ion-beam calc(var(--ti-ion-dur,.62s) * 1.05) cubic-bezier(.12,.9,.24,1) both}",
			".ti-ion[data-run] .ti-ion-flashring{animation:ti-ion-front calc(var(--ti-ion-dur,.62s) * .92) cubic-bezier(.12,.9,.22,1) both}",
			".ti-ion[data-run] .ti-ion-splash{animation:ti-ion-splash var(--ti-ion-dur,.68s) ease-out both}",
			"@keyframes ti-flow{from{background-position:0% 50%}to{background-position:300% 50%}}",
			"@keyframes ti-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
			"@keyframes ti-shine{from{background-position:140% 0}to{background-position:-140% 0}}",
			"@keyframes ti-ring{0%{transform:scale(.7);opacity:.8}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}",
			"@keyframes ti-spark{0%,100%{transform:translate3d(0,0,0) scale(.7);opacity:.18}",
			"45%{transform:translate3d(var(--ti-dx,6px),var(--ti-dy,-14px),0) scale(1.25);opacity:1}}",
			"@keyframes ti-breathe{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.03)}}",
			"@keyframes ti-flare{0%{transform:scale(.4);opacity:0}25%{transform:scale(1.3);opacity:1}100%{transform:scale(2.6);opacity:0}}",
			"@media (prefers-reduced-motion:reduce){.ti-card::before,.ti-shine,.ti-thumb-ring,.ti-spark,.ti-overdrive,",
			".ti-overdrive::after,.ti-grid-glow,.ti-rainbow-spark,.ti-card-overlay::before,.ti-card-overlay::after,",
			".ti-ion-ring,.ti-ion-ring2,.ti-ion-ring3,.ti-ion-ring4,.ti-ion-flashring,",
			".ti-ion-core,.ti-ion-beam,.ti-ion-splash,",
			".ti-dock[data-max='true'] .ti-fill,.ti-dock[data-max='true'] .ti-shine,.ti-dock[data-max='true'] .ti-label,",
			".ti-dock[data-max='true'] .ti-readout,.ti-dock[data-max='true'] .ti-badge{animation:none!important}",
			".ti-ion{display:none!important}}",
		].join("");

		/** Install a stylesheet tag once per document. */
		function installStyleTag(id, text) {
			try {
				if (typeof document === "undefined") return;
				var selector = "style[data-plugin-css=" + JSON.stringify(id) + "]";
				var existing = document.querySelector(selector);
				if (existing !== null && existing !== undefined) return;
				var tag = document.createElement("style");
				tag.setAttribute("data-plugin", "dsh-think-intensity");
				tag.setAttribute("data-plugin-css", id);
				if (tag.dataset) tag.dataset.pluginCss = id;
				tag.textContent = text;
				document.head.appendChild(tag);
			} catch (error) {
				/* styling must never be the reason the control breaks */
			}
		}

		// ── plugin body ───────────────────────────────────────────────────
		installStyleTag(CSS_TAG_ID, CSS);

		/** The view chunk's exports, resolved at apply time. */
		var view = null;

		var inject = ["slots"];

		function apply(ctx) {
			var resolveDirectory = function (sessionId) {
				var directories = ctx.get("modelDirectories");
				if (!directories || typeof directories.directoryFor !== "function") {
					throw new Error("dsh-think-intensity: model selection is unavailable (ui-model-selection is not in this composition)");
				}
				return directories.directoryFor(sessionId);
			};

			var isSubagentSession = function (sessionId) {
				try {
					var sessions = ctx.get("sessions");
					return !!(sessions && typeof sessions.subagentAddress === "function" && sessions.subagentAddress(sessionId) !== undefined);
				} catch (error) {
					return false;
				}
			};

			var React = require("react");

			/** The face both seats render from — the shape the model seat itself consumes. */
			var faceFor = function (sessionId) {
				// The store lives on `.store`; the verbs live on the controller.
				var directory = resolveDirectory(sessionId);
				return {
					store: directory && directory.store,
					select: directory && typeof directory.select === "function"
						? function (selection) { return directory.select(selection); }
						: null,
					load: directory && typeof directory.load === "function"
						? function () { return directory.load(); }
						: null,
					disabled: isSubagentSession(sessionId),
				};
			};

			/**
			 * Wrap one exported seat. The chunk resolves asynchronously, so the
			 * component is looked up at render time, never captured here.
			 */
			var entryFor = function (name) {
				return function ThinkIntensityEntry(props) {
					var Component = view && view[name];
					return typeof Component === "function" ? React.createElement(Component, props) : null;
				};
			};

			ctx.slots.inject(CHIP_SLOT, function () {
				return ctx.slots.register({
					name: CHIP_SLOT,
					id: ENTRY_ID + "-chip",
					order: 60,
					inject: faceFor,
				}, entryFor("ThinkIntensityChip"));
			});
		}

		// Load the view chunk before the seat can render, then keep it for the
		// lifetime of this module.
		require.async(VIEW_CHUNK).then(function (chunk) {
			view = chunk && chunk.ThinkIntensityChip ? chunk : (chunk && chunk.default ? chunk.default : chunk);
			if (!view || typeof view.ThinkIntensityChip !== "function") {
				throw new Error("dsh-think-intensity: the view chunk did not export ThinkIntensityChip");
			}
		});

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
