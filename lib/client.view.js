/**
 * dsh-think-intensity — browser half, view chunk.
 *
 * Loaded through the client module system's package-local chunk channel. Two
 * hard requirements come with that channel:
 *
 *   1. The specifier must be single-quoted at the call site (`require.async`)
 *      — a double quote becomes part of the URL and the request 404s.
 *   2. A chunk is an ordinary bundle script served under
 *      `/plugins/<id>/client.view.js?rev=…`, so it must register itself with
 *      `__ModuleLoader__.load({ id: "<owner package>/<file name>" })`, exactly
 *      like a package's own `client.js`.
 *
 * Props are the injection face the entry builds, mirroring the shape the
 * composer's own model seat consumes:
 *
 *   store     the session's `ModelDirectory.store` (snapshot store:
 *             `subscribe` / `getSnapshot`, holding `current`, `groups`, …)
 *   select    the directory's `select({ provider, model, reasoningEffort })` verb
 *   load      opens the host catalog when it is not loaded yet
 *   disabled  subagent-addressed sessions cannot choose a model
 *
 * Two seats render from it:
 *   `ThinkIntensityDock`  the panel above the composer card
 *   `ThinkIntensityChip`  the compact chip in the composer tool row
 */
window.__ModuleLoader__.load({
	id: "dsh-think-intensity/client.view.js",
	factory: (require) => {
		var module = { exports: {} };

		var exports = module.exports;
		var React = require("react");

		var SKIN = {
			root: { position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", margin: "8px 0 4px" },
			slot: { position: "relative", display: "inline-flex", alignItems: "center", minWidth: "0" },
			dock: { position: "relative", display: "flex", width: "100%" },
			card: {
				position: "relative", display: "flex", alignItems: "center", gap: "14px", width: "100%",
				minWidth: "0", height: "56px", padding: "0 16px", borderRadius: "16px",
				background: "rgba(128,128,128,.12)", border: "1px solid rgba(128,128,128,.45)", overflow: "hidden",
			},
			pop: {
				position: "absolute", right: 0, bottom: "calc(100% + 8px)", zIndex: 1200, width: "320px",
				maxWidth: "min(320px, 90vw)", padding: "12px", borderRadius: "14px",
				background: "var(--dsw-alias-bg-overlay,#1b1b22)", border: "1px solid rgba(128,128,128,.45)",
				boxShadow: "0 12px 32px rgba(0,0,0,.45)",
			},
			popBody: { position: "relative", display: "flex", flexDirection: "column", gap: "2px", width: "100%" },
			popRow: { position: "relative", display: "flex", alignItems: "baseline", gap: "8px", width: "100%" },
			// Short and thick: a chunky rail that does not sprawl sideways.
			slider: { position: "relative", flex: "0 0 auto", width: "100%", minWidth: "0", height: "44px", display: "flex", alignItems: "center" },
			track: { position: "relative", width: "100%", height: "30px", borderRadius: "999px", background: "rgba(128,128,128,.35)" },
			anchor: { position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "hidden" },
			error: {
				width: "100%", margin: "8px 0 4px", padding: "8px 12px", borderRadius: "10px", boxSizing: "border-box",
				border: "1px solid #ff4d6d", background: "rgba(255,77,109,.16)",
				font: "12px/1.6 ui-monospace,Consolas,monospace", color: "#ffd7de", whiteSpace: "pre-wrap",
			},
		};

		/** One stable empty snapshot, so the fallback getSnapshot stays referentially stable. */
		var EMPTY_SNAPSHOT = { current: null, routable: null, groups: [], failures: [], status: "idle", pending: null, error: null };

		/** Level colour: cold cyan at the bottom, violet through the middle, hot magenta at MAX. */
		function glowOf(ratio) {
			var r = Math.max(0, Math.min(1, ratio));
			var hue = 196 - 118 * r;
			return "hsl(" + hue.toFixed(0) + " 100% " + (62 - 4 * r).toFixed(0) + "% / " + (0.42 + 0.48 * r).toFixed(2) + ")";
		}

		/**
		 * The level-crossing palette: one three-colour burst per reasoning level,
		 * climbing from cold cyan to hot magenta as the level rises, so the effect
		 * itself tells you *where* you just crossed to.
		 */
		var BURST_PALETTE = [
			[92, 214, 255, 61, 140, 255, 122, 92, 255],
			[90, 230, 200, 40, 180, 255, 122, 110, 255],
			[170, 150, 255, 92, 110, 255, 220, 90, 255],
			[255, 130, 90, 255, 80, 160, 255, 190, 70],
			[255, 70, 120, 255, 170, 40, 255, 60, 220],
			[255, 60, 140, 255, 210, 40, 120, 240, 255],
		];

		/** Twelve hex digits (three RGB triplets) for one level's burst. */
		function burstColors(levelIndex, maxIndex) {
			var span = BURST_PALETTE.length - 1;
			var t = maxIndex > 0 ? Math.max(0, Math.min(1, levelIndex / maxIndex)) : 0;
			var picked = BURST_PALETTE[Math.round(t * span)];
			return picked.map(function (channel) { return String(channel).padStart(3, "0"); }).join("");
		}

		/**
		 * The resident ambient effect, one rung per level, and EVERY level above the
		 * lowest shows something.
		 *
		 * The design rule that this replaced a wash with: a broad low-alpha gradient is
		 * not readable on a dark theme at ANY alpha — it just becomes a film over the
		 * wallpaper. What is readable is STRUCTURE THAT MOVES, so each rung unlocks one
		 * more effect and every effect is made of discrete shapes:
		 *
		 *   1  motes   floating specks that rise and twinkle
		 *   2  rings   three seeds pulsing outward on crisp strokes
		 *   3  sweeps  two counter-travelling light bands
		 *   4  aurora  drifting sheets that also rotate through the spectrum
		 *
		 * `motes`, `rings`, `sweeps` and `sheets` are how many of each the rung uses;
		 * `alpha` is only the layer opacity now, not a veil strength.
		 */
		// EVERY count below is strictly increasing from rung to rung, in every column.
		// That is what guarantees no two rungs can look alike even if a level-to-rung
		// mapping ever collapses two levels onto the same rung.
		var AMBIENT_TIERS = [
			{ key: "off", label: "无", a: "150,225,255", b: "110,180,255", c: "170,190,255", alpha: 0, motes: 0, rings: 0, sweeps: 0, sheets: 0 },
			{ key: "motes", label: "光尘", a: "150,225,255", b: "110,180,255", c: "170,190,255", alpha: 1, motes: 40, rings: 0, sweeps: 0, sheets: 0 },
			{ key: "rings", label: "光尘 + 光环", a: "150,255,235", b: "90,200,255", c: "160,170,255", alpha: 1, motes: 52, rings: 3, sweeps: 0, sheets: 0 },
			{ key: "sweeps", label: "光尘 + 光环 + 流光", a: "255,200,120", b: "255,130,195", c: "150,175,255", alpha: 1, motes: 64, rings: 4, sweeps: 2, sheets: 0 },
			{ key: "aurora", label: "全效（含极光）", a: "215,195,255", b: "150,215,255", c: "255,180,225", alpha: 1, motes: 76, rings: 5, sweeps: 3, sheets: 3 },
			{ key: "aurora-max", label: "全效（过载）", a: "255,225,140", b: "255,150,205", c: "150,240,255", alpha: 1, motes: 88, rings: 6, sweeps: 4, sheets: 4 },
		];

		/**
		 * Which rung a level lands on.
		 *
		 * The mapping is deliberately NOT `round(level / max * span)`: on a five-level
		 * ladder that rounds to `0,1,1,0,0`, so low and medium shared a rung, high and
		 * max shared a rung, and the rung order was not even monotonic. Every level must
		 * land on its OWN rung as far as the ladder allows.
		 *
		 * The result is ALWAYS a valid index into the table. That is not incidental:
		 * the callers pass live drag values, so `levelIndex` arrives FRACTIONAL (it is
		 * `ratio * maxIndex` while the thumb moves), and `maxIndex` can arrive
		 * non-numeric. An unfloored fractional index reads `AMBIENT_TIERS[1.5]`, which is
		 * `undefined`, and the very next property read throws — that is what took the
		 * whole control down and left the light curtains unpainted.
		 */
		function rungForLevel(levelIndex, maxIndex) {
			var span = AMBIENT_TIERS.length - 1;
			var max = toCount(maxIndex);
			// A ladder with no levels at all is the "off" rung, not an error.
			if (max <= 0) return 0;
			var level = Math.floor(toCount(levelIndex));
			if (level < 0) level = 0;
			if (level > max) level = max;
			// At most as many levels as rungs: the level index IS the rung, so N levels
			// spread across N rungs and adjacent levels always differ.
			if (max <= span) return level;
			// More levels than rungs: proportional, then clamped to the last rung.
			return Math.min(span, Math.round((level / max) * span));
		}

		/** A non-negative integer from whatever the caller handed over. */
		function toCount(value) {
			var n = typeof value === "number" ? value : Number(value);
			if (!isFinite(n) || n < 0) return 0;
			return Math.floor(n);
		}

		/**
		 * The highest rung the given ladder can actually reach.
		 *
		 * `peak` used to be `rung === span`, i.e. "rung 5 of a 6-row table". On a ladder
		 * whose levels map one-to-one onto rungs, no level ever reaches rung 5, so the
		 * peak flag was ALWAYS false and the top level silently lost its peak-only
		 * treatment. The peak is the top of what is reachable, not the top of the table.
		 */
		function peakRungFor(maxIndex) {
			var span = AMBIENT_TIERS.length - 1;
			var max = toCount(maxIndex);
			if (max <= 0) return 0;
			return Math.min(span, max);
		}

		/** The effect recipe for a level: palette, and how many of each shape to build. */
		function ambientPlan(levelIndex, maxIndex) {
			var span = AMBIENT_TIERS.length - 1;
			var rung = rungForLevel(levelIndex, maxIndex);
			// Belt and braces: a plan is read on every render of the control, so it must
			// be impossible for a bad index to become a thrown property access.
			if (!(rung >= 0 && rung <= span)) rung = 0;
			var tier = AMBIENT_TIERS[rung] || AMBIENT_TIERS[0];
			return {
				rung: rung,
				key: tier.key,
				label: tier.label,
				// Every rung above the lowest renders. The lowest is the off rung.
				on: rung > 0,
				// The peak is the strongest rung THIS ladder can reach, so the top level of
				// any level count gets the peak treatment.
				peak: rung > 0 && rung === peakRungFor(maxIndex),
				a: tier.a,
				b: tier.b,
				c: tier.c,
				alpha: tier.alpha,
				motes: tier.motes,
				rings: tier.rings,
				sweeps: tier.sweeps,
				sheets: tier.sheets,
				// The old field name, kept so the trace line and older assertions still
				// have a single "how much is here" number to show.
				dust: tier.motes,
			};
		}

		// ── the effect switches ──────────────────────────────────────────
		//
		// TWO PRIMARY KEYS, three mutually exclusive states:
		//
		//   mode = "default"   the rung's own supply decides everything; the per-family
		//                      checkboxes are inert and are drawn as such
		//   mode = "custom"    only the checked families render, and they render at
		//                      whatever the rung would have given them
		//   mode = "off"       nothing renders, identical to the lowest rung
		//
		// `burst` sits outside the two primary keys: it is a fourth, independent switch,
		// because the crossing shockwave is a different effect axis from the resident one.
		//
		// The filter is a pure function over the recipe rather than a second styling path,
		// so "off" and "level = lowest" collapse to the SAME plan shape and therefore paint
		// the same DOM. There is no way for the two to drift apart.
		// TWO primary keys, three states:
		//
		//   default  the RUNG owns the combination; the checkboxes are ignored
		//   custom   the CHECKBOXES own the combination, at the top row's density, at full
		//            brightness and with the top row's palette, IDENTICAL at every level
		//            including the lowest
		//   off      nothing renders — the explicit "silence everything" state
		//
		// `off` is the only state that blanks the screen, and it does so on purpose. Custom mode
		// must NEVER behave like it, whatever level the slider is on: a level with little or no
		// effect of its own (the lowest rung has none at all) is still a level where custom mode
		// renders the full combination.
		var EFFECT_MODE_DEFAULT = "default";
		var EFFECT_MODE_CUSTOM = "custom";
		var EFFECT_MODE_OFF = "off";
		var EFFECT_MODES = [EFFECT_MODE_DEFAULT, EFFECT_MODE_CUSTOM, EFFECT_MODE_OFF];
		var EFFECT_MODE_LABELS = { default: "默认特效", custom: "自定义特效", off: "特效关闭" };
		var EFFECT_KEYS = ["motes", "rings", "sweeps", "aurora"];
		var EFFECT_LABELS = { motes: "光尘", rings: "光环", sweeps: "流光", aurora: "极光", burst: "冲击波" };
		var EFFECT_STORE_KEY = "dsh-think-intensity/effects";

		/** Default mode with every family checked. */
		function defaultEffectSettings() {
			return { mode: EFFECT_MODE_DEFAULT, motes: true, rings: true, sweeps: true, aurora: true, burst: true };
		}

		/** Coerce a mode value, migrating the older boolean shape. */
		function coerceEffectMode(value, raw) {
			if (value === EFFECT_MODE_DEFAULT || value === EFFECT_MODE_CUSTOM || value === EFFECT_MODE_OFF) return value;
			// Migration: settings written before the mode existed carried `all`.
			if (raw && typeof raw === "object" && typeof raw.all === "boolean") {
				return raw.all ? EFFECT_MODE_DEFAULT : EFFECT_MODE_OFF;
			}
			return EFFECT_MODE_DEFAULT;
		}

		/** The next state in the cycle 默认 → 自定义 → 关闭 → 默认. */
		function nextEffectMode(mode) {
			var at = EFFECT_MODES.indexOf(mode);
			if (at < 0) return EFFECT_MODE_DEFAULT;
			return EFFECT_MODES[(at + 1) % EFFECT_MODES.length];
		}

		/** Coerce anything into a complete, well-typed settings object. */
		function normalizeEffectSettings(raw) {
			var base = defaultEffectSettings();
			if (!raw || typeof raw !== "object") return base;
			base.mode = coerceEffectMode(raw.mode, raw);
			for (var i = 0; i < EFFECT_KEYS.length; i++) {
				if (typeof raw[EFFECT_KEYS[i]] === "boolean") base[EFFECT_KEYS[i]] = raw[EFFECT_KEYS[i]];
			}
			if (typeof raw.burst === "boolean") base.burst = raw.burst;
			return base;
		}

		/** Read the saved switches. Never throws: a broken store just means "default". */
		function loadEffectSettings() {
			try {
				if (typeof localStorage === "undefined" || !localStorage) return defaultEffectSettings();
				var text = localStorage.getItem(EFFECT_STORE_KEY);
				if (!text) return defaultEffectSettings();
				return normalizeEffectSettings(JSON.parse(text));
			} catch (error) {
				return defaultEffectSettings();
			}
		}

		/** Persist the switches. The control must not break if storage is unavailable. */
		function saveEffectSettings(settings) {
			try {
				if (typeof localStorage === "undefined" || !localStorage) return;
				localStorage.setItem(EFFECT_STORE_KEY, JSON.stringify(settings));
			} catch (error) {
				/* private mode and quota errors are not worth a broken control */
			}
		}

		/**
		 * Does this family actually reach the screen?
		 *
		 * Each mode owns the combination in exactly one way, and no two modes share control:
		 *
		 *   default  the RUNG owns it. The checkboxes are ignored completely, so a stale
		 *            selection left over from custom mode can never silence the default
		 *            supply. This was the "默认特效又没了" bug: default mode still ANDed the
		 *            checkboxes, so a family unticked earlier in custom mode silently removed
		 *            itself from the default supply, and the lamps — which read the rung —
		 *            kept claiming everything was fine.
		 *   custom   the CHECKBOXES own it, at a fixed maximum density.
		 *   off      nothing renders; the boxes only set up what custom will show next.
		 */
		function effectEnabled(settings, key) {
			var s = settings || defaultEffectSettings();
			if (s.mode === EFFECT_MODE_OFF) return false;
			// `burst` sits outside the two primary keys, so no mode overrides it.
			if (key === "burst") return s.burst !== false;
			if (s.mode === EFFECT_MODE_DEFAULT) return true;
			return s[key] !== false;
		}

		/** Is the checkbox itself ticked? This is what the indicator lamp shows outside default mode. */
		function effectChecked(settings, key) {
			var s = settings || defaultEffectSettings();
			if (key === "burst") return s.burst !== false;
			return s[key] !== false;
		}

		/** Are the per-family checkboxes what decides the combination? */
		function effectsAreCustom(settings) {
			return (settings || defaultEffectSettings()).mode === EFFECT_MODE_CUSTOM;
		}

		/** Does this mode draw its sub-key lamps from the rung instead of from the boxes? */
		function effectsFromRung(settings) {
			return (settings || defaultEffectSettings()).mode === EFFECT_MODE_DEFAULT;
		}

		/**
		 * Which families a RUNG supplies, as booleans.
		 *
		 * This is what a sub-key lamp shows in default mode: the rung's own supply, so the
		 * panel draws `low -> only 光尘 lit`, `max -> all four lit`. The lamp is a readout of
		 * the rung, not of the checkbox, in that mode.
		 */
		function rungSupplies(plan) {
			return {
				motes: !!(plan && plan.motes > 0),
				rings: !!(plan && plan.rings > 0),
				sweeps: !!(plan && plan.sweeps > 0),
				aurora: !!(plan && plan.sheets > 0),
			};
		}

		/**
		 * The counts custom mode supplies: the table's top row, at FULL brightness, whatever
		 * level is selected.
		 *
		 * Two axes, deliberately separated:
		 *
		 *   DENSITY    88/6/4/4 — the top row's own numbers. Each family keeps its own scale,
		 *              because 88 rings or 88 sheets is not "more effect", it is a compositor
		 *              crash: a ring is a 220px circle with a 22px glow and a sheet is a 34vh
		 *              blurred band, so those families are dense at single digits by design.
		 *   BRIGHTNESS flat at maximum — the host is flagged `data-custom`, so the stylesheet
		 *              lights every non-empty pool at full opacity. Nothing is scaled by the
		 *              rung, so custom mode at the LOWEST level is as bright as at max.
		 *
		 * Inheriting the rung's counts is what must not happen: a low rung supplies zero rings,
		 * so `min(0, checked)` is zero either way and those keys could never do anything.
		 */
		var CUSTOM_SUPPLY = { motes: 88, rings: 6, sweeps: 4, sheets: 4 };

		/**
		 * The palette custom mode renders with: the TOP ROW's, not the selected level's.
		 *
		 * This is the other half of "custom mode looks the same at every level", and it fixes a
		 * subtle failure. The lowest rung's entry carries `alpha: 0`, and that alpha is written
		 * into the host's `--ti-glow` variable — the colour of every shape's glow. Counts alone
		 * were therefore not enough: custom mode at the lowest level drew the right number of
		 * shapes, with no bloom on any of them, which reads as "the effect never turned on".
		 */
		var CUSTOM_SUPPLY_TIER = AMBIENT_TIERS[AMBIENT_TIERS.length - 1];

		/**
		 * How many shapes the mode itself is willing to supply, before the checkboxes.
		 *
		 * Custom mode always supplies the top row, so every checkbox is meaningful at every
		 * level, including the lowest.
		 */
		function modeSupply(mode, plan, key) {
			if (mode === EFFECT_MODE_OFF) return 0;
			if (mode === EFFECT_MODE_CUSTOM) return CUSTOM_SUPPLY[key] || 0;
			return plan ? plan[key] : 0;
		}

		/**
		 * Apply the switches to a plan.
		 *
		 * DEFAULT MODE APPLIES NOTHING AT ALL. That is the point of it: the rung decides, and
		 * the checkboxes — including a stale selection left in storage from a custom session —
		 * cannot touch the result. Using the real plan unchanged is what makes "默认特效" mean
		 * exactly what it says.
		 *
		 * Off mode zeroes every family. It is the only state that blanks the screen, and it is
		 * reached deliberately, never as a side effect of the selected level.
		 *
		 * CUSTOM MODE MUST LOOK THE SAME AT EVERY LEVEL, INCLUDING THE LOWEST. That is why it
		 * takes its PALETTE from the top row as well as its counts: the lowest rung's palette
		 * carries `alpha: 0`, which is written into the host's `--ti-glow` — the colour of every
		 * shape's glow — so a custom combination rendered with it lost all of its bloom and read
		 * as "the effect did not turn on". Counts, brightness and palette all come from the top
		 * row, so the level genuinely cannot matter in custom mode.
		 */
		function applyEffectFilter(plan, settings) {
			if (!plan) return plan;
			var s = settings || defaultEffectSettings();
			if (s.mode === EFFECT_MODE_DEFAULT) return plan;
			if (s.mode === EFFECT_MODE_OFF) {
				return Object.assign({}, plan, {
					on: false, peak: false, motes: 0, rings: 0, sweeps: 0, sheets: 0, dust: 0, filtered: true,
				});
			}
			var motes = s.motes !== false ? modeSupply(s.mode, plan, "motes") : 0;
			var rings = s.rings !== false ? modeSupply(s.mode, plan, "rings") : 0;
			var sweeps = s.sweeps !== false ? modeSupply(s.mode, plan, "sweeps") : 0;
			var sheets = s.aurora !== false ? modeSupply(s.mode, plan, "sheets") : 0;
			var any = motes + rings + sweeps + sheets > 0;
			return Object.assign({}, plan, {
				on: any,
				// The peak treatment belongs to the full effect, so a trimmed-down plan does
				// not claim it; custom mode with everything ticked is a full effect.
				peak: motes !== 0 && rings !== 0 && sweeps !== 0 && sheets !== 0,
				motes: motes,
				rings: rings,
				sweeps: sweeps,
				sheets: sheets,
				dust: motes,
				// The top row's palette, for the reason spelled out above.
				a: CUSTOM_SUPPLY_TIER.a,
				b: CUSTOM_SUPPLY_TIER.b,
				c: CUSTOM_SUPPLY_TIER.c,
				alpha: CUSTOM_SUPPLY_TIER.alpha,
				// A data-path flag, not a mode flag: it says the checkboxes removed something.
				filtered: motes !== plan.motes || rings !== plan.rings || sweeps !== plan.sweeps || sheets !== plan.sheets,
			});
		}

		/** One ambient host per document, exactly like the burst host. */
		var sharedAmbientHost = null;

		/** The four effect families, in pool order. */
		var AMB_POOLS = ["motes", "rings", "sweeps", "aurora"];

		/** Build the ambient host: four pre-created effect containers. */
		function createAmbientHost() {
			var host = document.createElement("div");
			host.className = "ti-amb";
			host.setAttribute("data-on", "false");
			host.setAttribute("data-lv", "0");
			// Part of the host's public state: the machine-readable trace event carries the same
			// flags, so the peak state stays observable from the DOM too. No stylesheet consumes
			// it — it exists to be read.
			host.setAttribute("data-peak", "false");

			var names = AMB_POOLS;
			for (var i = 0; i < names.length; i++) {
				var layer = document.createElement("div");
				layer.className = "ti-amb-layer ti-amb-" + names[i];
				layer.setAttribute("data-pool", names[i]);
				layer.setAttribute("data-count", "0");
				host.appendChild(layer);
			}
			return host;
		}

		/** Deterministic pseudo-random source, so a rebuild is identical every time. */
		function ambRand(seed) {
			var s = seed || 1;
			return function () {
				s = (s * 1103515245 + 12345) & 0x7fffffff;
				return s / 0x7fffffff;
			};
		}

		/**
		 * Per-shape peak opacity, drawn from a FIXED ring of values by position.
		 *
		 * This used to be `0.45 + rand() * 0.5` — a value taken from the shared random stream.
		 * The stream is deterministic per POOL, not per shape, so a pool of 6 and a pool of 88
		 * sampled different stretches of it and averaged to different brightnesses. That is
		 * exactly the "custom mode is not as bright as max" effect: brightness was coupled to
		 * the shape count.
		 *
		 * Indexing a fixed ring decouples the two, so the family's average brightness is the
		 * same whether it holds 4 shapes or 88. The values still vary per shape, so the field
		 * keeps its irregular, non-mechanical look.
		 */
		var SHAPE_BRIGHTNESS = {
			motes: [0.72, 0.88, 0.62, 0.95, 0.78],
			rings: [0.74, 0.86, 0.66, 0.9],
			sweeps: [0.86, 0.94, 0.8, 0.92],
		};

		/** The peak opacity for one shape. */
		function shapeBrightness(pool, index) {
			var ring = SHAPE_BRIGHTNESS[pool];
			if (!ring || ring.length === 0) return 0.85;
			var at = Math.abs(Math.round(toCount(index))) % ring.length;
			return ring[at];
		}

		/** One shape of a pool, with its geometry and timing baked onto the element. */
		function buildAmbientShape(pool, index, total, rand) {
			var node = document.createElement("span");
			var spread = total > 1 ? index / (total - 1) : 0;
			if (pool === "motes") {
				node.className = "ti-amb-mote";
				node.style.setProperty("--mx", (2 + rand() * 96).toFixed(2) + "%");
				node.style.setProperty("--my", (55 + spread * 45).toFixed(2) + "%");
				node.style.setProperty("--ms", (1.6 + rand() * 2.8).toFixed(2) + "px");
				node.style.setProperty("--mo", shapeBrightness("motes", index).toFixed(2));
				node.style.setProperty("--mxd", (((rand() * 2) - 1) * 60).toFixed(1) + "px");
				node.style.setProperty("--md", (6 + rand() * 8).toFixed(2) + "s");
				node.style.setProperty("--mdl", "-" + (rand() * 12).toFixed(2) + "s");
				return node;
			}
			if (pool === "rings") {
				node.className = "ti-amb-ring";
				// Seeds are spread around a circle instead of stacking in the middle.
				var angle = index * (Math.PI * 2 / Math.max(1, total));
				node.style.setProperty("--rx", (50 + Math.cos(angle) * 26).toFixed(1) + "%");
				node.style.setProperty("--ry", (50 + Math.sin(angle) * 22).toFixed(1) + "%");
				node.style.setProperty("--rd", (4.4 + rand() * 2.4).toFixed(2) + "s");
				node.style.setProperty("--rdl", "-" + (rand() * 5).toFixed(2) + "s");
				node.style.setProperty("--rscale", (5.5 + rand() * 3.5).toFixed(2));
				node.style.setProperty("--ro", shapeBrightness("rings", index).toFixed(2));
				return node;
			}
			if (pool === "sweeps") {
				node.className = "ti-amb-sweep";
				node.style.top = (12 + spread * 58).toFixed(1) + "%";
				// Thin ribbons: 10-16vh instead of a 32vh slab.
				node.style.setProperty("--sh", (10 + rand() * 6).toFixed(1) + "vh");
				// The tilt swings between these three values as the band travels, which is
				// what turns a straight slide into a curved path. Each band gets its own
				// set, so the field never looks like one rigid bar.
				var tilt = 4 + rand() * 5;
				node.style.setProperty("--st0", "-" + tilt.toFixed(1) + "deg");
				node.style.setProperty("--st1", tilt.toFixed(1) + "deg");
				node.style.setProperty("--stm", (-tilt * 0.45).toFixed(1) + "deg");
				// The ripple amplitude: this is the vertical undulation. It differs per band
				// so the ribbons never bob in lockstep.
				node.style.setProperty("--samp", (2.5 + rand() * 4).toFixed(2) + "vh");
				node.style.setProperty("--sd", (11 + rand() * 5).toFixed(2) + "s");
				node.style.setProperty("--sdl", "-" + (rand() * 9).toFixed(2) + "s");
				node.style.setProperty("--so", shapeBrightness("sweeps", index).toFixed(2));
				// Alternate the travel direction per shape. A reversed animation mirrors the
				// ripple as well, which is exactly what keeps the field from marching.
				node.style.animationDirection = index % 2 === 1 ? "reverse" : "normal";
				return node;
			}
			node.className = "ti-amb-sheet";
			node.style.top = (2 + spread * 58).toFixed(1) + "%";
			node.style.height = (24 + rand() * 18).toFixed(1) + "vh";
			// A near-white core with tinted shoulders: the sheet has to carry brightness
			// itself, because the surrounding blur only softens its edges now.
			node.style.background = "linear-gradient(90deg,transparent,rgba(var(--ti-amb-a,215,195,255),.8) 24%,"
				+ "rgba(255,255,255,.9) 44%,rgba(var(--ti-amb-c,255,180,225),.85) 58%,"
				+ "rgba(var(--ti-amb-b,150,215,255),.7) 76%,transparent)";
			// A slight tilt so the sheets read as ribbons rather than bars. It goes in as a
			// variable because the drift keyframes own `transform`.
			node.style.setProperty("--atilt", (((rand() * 2) - 1) * 5).toFixed(1) + "deg");
			node.style.setProperty("--ad", (16 + rand() * 10).toFixed(2) + "s");
			node.style.setProperty("--adl", "-" + (rand() * 11).toFixed(2) + "s");
			return node;
		}

		/**
		 * Fill one pool with exactly `wanted` shapes.
		 *
		 * Rebuilt only when the count actually changes: consecutive rungs reuse most of
		 * the pool, so most level changes cost nothing but attribute writes.
		 */
		function fillAmbientPool(host, pool, wanted, seed) {
			var layer = host && typeof host.querySelector === "function" ? host.querySelector('[data-pool="' + pool + '"]') : null;
			if (!layer) return;
			if (Number(layer.getAttribute("data-count")) === wanted) return;
			if (typeof layer.removeChild === "function") {
				while (layer.firstChild) layer.removeChild(layer.firstChild);
			}
			var rand = ambRand(seed);
			for (var i = 0; i < wanted; i++) {
				layer.appendChild(buildAmbientShape(pool, i, wanted, rand));
			}
			layer.setAttribute("data-count", String(wanted));
		}

		/**
		 * Paint one rung: fill each pool to the recipe's count and record the total, so
		 * the state is readable without inspecting the DOM by hand.
		 */
		function paintAmbient(host, plan) {
			if (!host) return host;
			fillAmbientPool(host, "motes", plan.motes, 20260101);
			fillAmbientPool(host, "rings", plan.rings, 770011);
			fillAmbientPool(host, "sweeps", plan.sweeps, 313131);
			fillAmbientPool(host, "aurora", plan.sheets, 909091);
			host.setAttribute("data-painted", String(plan.motes + plan.rings + plan.sweeps + plan.sheets));
			return host;
		}

		/**
		 * Apply a plan to the ambient host.
		 *
		 * `mode` is written onto the host as `data-custom`, which is what lets the stylesheet
		 * light ANY non-empty pool in custom mode: the density there is a flat maximum and the
		 * brightness has to match it, whatever level the slider happens to be on.
		 */
		function applyAmbient(host, plan, glow, mode) {
			if (!host) return;
			host.setAttribute("data-on", plan.on ? "true" : "false");
			host.setAttribute("data-lv", String(plan.rung));
			host.setAttribute("data-peak", plan.peak ? "true" : "false");
			host.setAttribute("data-custom", mode === EFFECT_MODE_CUSTOM ? "true" : "false");
			host.style.setProperty("--ti-amb-a", plan.a);
			host.style.setProperty("--ti-amb-b", plan.b);
			host.style.setProperty("--ti-amb-c", plan.c);
			host.style.setProperty("--ti-glow", glow);
			// The pools are rebuilt to the recipe's counts, and the host records the total so
			// the state is readable from a single attribute.
			paintAmbient(host, plan);
			return host;
		}

		/**
		 * How hard a crossing hits, as a function of where it lands on the ladder.
		 *
		 * Rows run from the lowest level to the highest, and each row is a complete
		 * description of one burst. The rungs are deliberately far apart — the top of
		 * the ladder is a full-screen detonation twice the reach, twice the brightness
		 * and twice as long as the middle, and the bottom is a restrained flick.
		 *
		 * rings  - how many concentric rings expand (the core and the wall flash are
		 *          always there; the beam unlocks at the second rung)
		 * dur    - base ring duration in seconds; the core, the second ring and the
		 *          beam all derive from it
		 * end    - terminal scale of a ring (rings are 84px, so 26 ≈ 2200px)
		 * reach  - radius of the wall flash
		 * sa     - alpha of the wall flash
		 * flash  - alpha of the hard specular hotspot at the pointer
		 * front  - stroke width of the white-hot leading edge
		 * weight - ring stroke width
		 * ringA  - peak ring opacity
		 * coreA  - peak whiteness of the core
		 * corePk - peak core scale
		 */
		var BURST_FORCE = [
			{ rings: 1, dur: 0.40, end: 10, reach: "40vmax", sa: 0.16, flash: 0.22, front: 3, weight: 2.5, ringA: 0.72, coreA: 0.5, corePk: 0.62 },
			{ rings: 1, dur: 0.52, end: 16, reach: "52vmax", sa: 0.26, flash: 0.36, front: 3.5, weight: 3, ringA: 0.85, coreA: 0.62, corePk: 0.8 },
			{ rings: 2, dur: 0.64, end: 22, reach: "64vmax", sa: 0.36, flash: 0.5, front: 4, weight: 3.6, ringA: 0.92, coreA: 0.72, corePk: 0.95 },
			{ rings: 3, dur: 0.80, end: 30, reach: "78vmax", sa: 0.48, flash: 0.62, front: 4.6, weight: 4.2, ringA: 0.98, coreA: 0.82, corePk: 1.1 },
			{ rings: 3, dur: 0.96, end: 38, reach: "94vmax", sa: 0.6, flash: 0.74, front: 5.2, weight: 5, ringA: 1, coreA: 0.9, corePk: 1.3 },
			{ rings: 4, dur: 1.08, end: 48, reach: "112vmax", sa: 0.72, flash: 0.86, front: 6, weight: 5.8, ringA: 1, coreA: 1, corePk: 1.5 },
		];

		/** The burst recipe for a level: colours plus force, as plain data. */
		function burstPlan(levelIndex, maxIndex) {
			var span = BURST_FORCE.length - 1;
			var t = maxIndex > 0 ? Math.max(0, Math.min(1, levelIndex / maxIndex)) : 0;
			var rung = Math.round(t * span);
			var colors = burstColors(levelIndex, maxIndex);
			var force = BURST_FORCE[rung];
			return {
				rung: rung,
				colors: colors,
				a: colors.slice(0, 3) + "," + colors.slice(3, 6) + "," + colors.slice(6, 9),
				rings: force.rings,
				beam: rung >= 1,
				dur: force.dur,
				end: force.end,
				reach: force.reach,
				sa: force.sa,
				flash: force.flash,
				front: force.front,
				weight: force.weight,
				ringA: force.ringA,
				coreA: force.coreA,
				corePk: force.corePk,
			};
		}

		/** Every ring slot, innermost first. Slot 0 is always armed. */
		var ION_LAYER_CLASSES = ["ti-ion-ring", "ti-ion-ring2", "ti-ion-ring3", "ti-ion-ring4"];

		/**
		 * Build the burst node: one splash, one core, one beam and the full pool of
		 * ring slots. Called once per seat and never again — every later firing only
		 * toggles attributes and custom properties on these exact nodes.
		 */
		function createBurstHost() {
			var host = document.createElement("div");
			host.className = "ti-ion";
			// No `data-run` at rest. The flag is added for exactly one burst and removed
			// when it ends, so the layers always fall back to their `opacity:0` resting
			// state — never to a full-size visible node.
			var splash = document.createElement("div");
			splash.className = "ti-ion-splash";
			var core = document.createElement("div");
			core.className = "ti-ion-core";
			var beam = document.createElement("div");
			beam.className = "ti-ion-beam";
			// The white-hot leading edge: a single neutral ring that always fires, so a
			// crossing reads as an impact even at the lowest level.
			var front = document.createElement("div");
			front.className = "ti-ion-flashring";
			host.appendChild(splash);
			host.appendChild(core);
			host.appendChild(beam);
			host.appendChild(front);
			// A fixed pool of ring slots, innermost first: the recipe arms as many as
			// the level calls for and leaves the rest unarmed (`[data-arm]` gates their
			// animation). Keeping the count fixed — and equal to the widest recipe — is
			// what makes repeated firing free: after this point no node is ever added or
			// removed, only attributes are toggled.
			for (var i = 0; i < ION_LAYER_CLASSES.length; i++) {
				var ring = document.createElement("div");
				ring.className = ION_LAYER_CLASSES[i];
				host.appendChild(ring);
			}
			return host;
		}

		/**
		 * Arm the ring slots the recipe asks for and park the rest.
		 *
		 * Each slot is a beat slower and reaches a little less far than the one inside
		 * it, so a heavier level reads as a train of waves rather than one thick ring.
		 */
		function armBurstLayers(host, plan) {
			for (var i = 0; i < ION_LAYER_CLASSES.length; i++) {
				var slot = host.querySelector("." + ION_LAYER_CLASSES[i]);
				if (!slot || !slot.style || typeof slot.style.setProperty !== "function") continue;
				if (i < plan.rings) {
					slot.setAttribute("data-arm", "");
					slot.style.setProperty("--ti-ion-dur", plan.dur.toFixed(2) + "s");
					slot.style.setProperty("--ti-ion-ring-end", String(Math.max(2, plan.end - i * 3)));
					slot.style.setProperty("--ti-ion-weight", (plan.weight * (1 - i * 0.25)).toFixed(1) + "px");
					slot.style.setProperty("--ti-ion-ring-a", (plan.ringA * (1 - i * 0.18)).toFixed(2));
					slot.style.setProperty("--ti-ion-a", plan.a.slice(0, 3));
					slot.style.setProperty("--ti-ion-c", plan.a.slice(6, 9));
				} else {
					slot.removeAttribute("data-arm");
				}
			}
			return host;
		}

		/**
		 * The dependency key for the resident aura: it must change whenever — and only
		 * whenever — the painted result would differ.
		 *
		 * It used to be built from `plan.dust` alone, and `dust` is the MOTE count. So
		 * unchecking 光环 / 流光 / 极光 left the key byte-for-byte identical, the effect never
		 * re-ran, `applyAmbient` was never called, and those three families stayed on screen
		 * no matter how many times they were switched off. Only 光尘 appeared to work.
		 *
		 * Every count is now part of the key, so any change to any family repaints. The MODE
		 * is part of it too: switching modes changes no count, but it does change the host's
		 * `data-custom` flag and therefore how the stylesheet lights the pools.
		 */
		function ambientSignature(plan, glow, mode) {
			if (!plan) return "none";
			return [
				mode || "",
				plan.rung,
				plan.on ? "1" : "0",
				plan.peak ? "p" : "-",
				plan.alpha,
				plan.motes, plan.rings, plan.sweeps, plan.sheets,
				plan.a, plan.b, plan.c,
				glow,
			].join("|");
		}

		/**
		 * The resident ambient aura. It is a STATE, not an event: it is applied whenever
		 * the selected level changes and left alone in between, so the only work per
		 * level change is a handful of attribute and custom-property writes (plus a
		 * rebuild of the dust field when the tier's density actually differs).
		 */
		function useAmbientAura(plan, glow, mode) {
			var hostRef = React.useRef(null);

			var ensureHost = function () {
				if (sharedAmbientHost && sharedAmbientHost.isConnected) {
					hostRef.current = sharedAmbientHost;
					return sharedAmbientHost;
				}
				try {
					var host = createAmbientHost();
					(document.body || document.documentElement).appendChild(host);
					sharedAmbientHost = host;
					hostRef.current = host;
					return host;
				} catch (error) {
					return null;
				}
			};

			// One key that changes exactly when the visible result must change, so the
			// effect does not re-run on every unrelated re-render of the chip.
			var signature = ambientSignature(plan, glow, mode);

			/**
			 * What actually reached the DOM last time. This is the honest answer to "is
			 * the aura mounted and switched on?", which cannot be observed from the
			 * control itself — the host is a sibling of the whole application.
			 */
			var [applied, setApplied] = React.useState(null);

			React.useEffect(function () {
				var host = ensureHost();
				sinkAmbientBehind(host);
				applyAmbient(host, plan, glow, mode);
				setApplied({
					rung: plan.rung,
					key: plan.key,
					on: plan.on,
					alpha: plan.alpha,
					dust: plan.dust,
					mounted: !!(host && host.parentNode),
					layers: host ? host.children.length : 0,
				});
				// A machine-readable trace, so a future regression can be caught by listening
				// for this event instead of reading the DOM by hand. Nothing is logged to the
				// console: a plugin has no business writing to the host application's console.
				try {
					if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
						window.dispatchEvent(new window.CustomEvent("dsh-think-intensity:ambient", {
							detail: {
								rung: plan.rung, key: plan.key, on: plan.on, alpha: plan.alpha, dust: plan.dust,
								mounted: !!(host && host.parentNode), layers: host ? host.children.length : 0,
							},
						}));
					}
				} catch (error) {
					/* the trace is optional */
				}
			}, [signature]);

			return applied;
		}

		/**
		 * Keep the aura at the very bottom of the paint order.
		 *
		 * `z-index: 0` is only "behind" the shell while the host is the FIRST child of
		 * `<body>`: every sibling the shell mounts afterwards paints above it. React
		 * portals append to the body, so the position is re-asserted on every change
		 * rather than only at creation.
		 */
		function sinkAmbientBehind(host) {
			try {
				if (!host || !host.parentNode) return;
				var parent = document.body || document.documentElement;
				if (parent.firstChild !== host) parent.insertBefore(host, parent.firstChild);
			} catch (error) {
				/* stacking order is cosmetic; never break the control over it */
			}
		}

		/** Longer than every animation a burst can start, so the flag outlives them all. */
		function burstLifetime(plan) {
			// ring4 is the longest: 1.75x the base duration, and it starts last.
			return Math.round(plan.dur * 1750) + 260;
		}

		/**
		 * The single burst node for the whole document, kept across renders and across
		 * remounts of the seats. Replaying a CSS animation only works on a node the
		 * browser has painted, so this must never be rebuilt per firing.
		 */
		var sharedHost = null;

		/**
		 * The full-viewport level-crossing shockwave.
		 *
		 * Requirements that shaped this: a crossing must fire immediately, must be able
		 * to fire without bound while the pointer is dragged back and forth over a
		 * boundary, and must get visibly heavier as the level rises. So the layers are
		 * created ONCE, the per-level force is applied as custom properties, and every
		 * firing only toggles which layers are armed plus one reflow to replay — no
		 * node churn, no layout work, and a hard cap of one burst node per seat.
		 *
		 * Exported for the local test, which asserts the replay flag and the geometry
		 * without a browser.
		 */
		function useIonBurst() {
			var hostRef = React.useRef(null);
			var timerRef = React.useRef(null);
			var burstCountRef = React.useRef(0);

			/**
			 * The one burst node in the document.
			 *
			 * It is cached at MODULE level, not only in this hook's ref: the node must
			 * outlive every render and every remount of the seats, because replaying an
			 * animation is only meaningful on a node the browser has already painted.
			 * Creating a fresh node per firing is what made the effect silently vanish.
			 */
			var ensureHost = function () {
				if (sharedHost && sharedHost.isConnected) {
					hostRef.current = sharedHost;
					return sharedHost;
				}
				try {
					var host = createBurstHost();
					(document.body || document.documentElement).appendChild(host);
					sharedHost = host;
					hostRef.current = host;
					return host;
				} catch (error) {
					return null;
				}
			};

			/**
			 * Fire one burst at a viewport point for a level index.
			 * @param clientX - pointer x in viewport coordinates.
			 * @param clientY - pointer y in viewport coordinates.
			 * @param levelIndex - the level that was just crossed into.
			 * @param maxIndex - the highest level available.
			 */
			var fire = function (clientX, clientY, levelIndex, maxIndex) {
				var host = ensureHost();
				if (!host) return;
				try {
					burstCountRef.current += 1;
					var plan = burstPlan(levelIndex, maxIndex);
					var x = (typeof clientX === "number" && isFinite(clientX) ? clientX : window.innerWidth / 2) + "px";
					var y = (typeof clientY === "number" && isFinite(clientY) ? clientY : window.innerHeight / 2) + "px";
					host.style.setProperty("--ti-ion-x", x);
					host.style.setProperty("--ti-ion-y", y);
					host.style.setProperty("--ti-ion-a", plan.a);
					host.style.setProperty("--ti-ion-cycles", String(burstCountRef.current));
					// The force knobs. Everything below is one set of keyframes.
					host.style.setProperty("--ti-ion-dur", plan.dur.toFixed(2) + "s");
					host.style.setProperty("--ti-ion-core-dur", (plan.dur * 0.72).toFixed(2) + "s");
					host.style.setProperty("--ti-ion-reach", plan.reach);
					host.style.setProperty("--ti-ion-reach-scale", String(plan.end * 1.6));
					host.style.setProperty("--ti-ion-sa", String(plan.sa));
					host.style.setProperty("--ti-ion-flash", String(plan.flash));
					host.style.setProperty("--ti-ion-front", plan.front.toFixed(1) + "px");
					host.style.setProperty("--ti-ion-front-a", plan.ringA.toFixed(2));
					host.style.setProperty("--ti-ion-core-a", String(plan.coreA));
					host.style.setProperty("--ti-ion-core-peak", String(plan.corePk));
					host.style.setProperty("--ti-ion-weight", plan.weight.toFixed(1) + "px");
					host.style.setProperty("--ti-ion-ring-a", String(plan.ringA));
					host.style.setProperty("--ti-ion-ring-end", String(plan.end));
					host.style.setProperty("--ti-ion-beam-end", String(Math.round(plan.end * 1.5)));
					// Arm only the slots this level calls for.
					armBurstLayers(host, plan);
					// Replay: removing the flag, forcing a reflow and re-adding it restarts
					// the animations even while the previous ones are still running, which
					// is what lets a back-and-forth drag fire every single crossing.
					host.removeAttribute("data-run");
					void host.offsetWidth;
					host.setAttribute("data-run", "");
					if (timerRef.current !== null) window.clearTimeout(timerRef.current);
					timerRef.current = window.setTimeout(function () {
						timerRef.current = null;
						// Removing the flag — not setting it to "false" — is what returns the
						// layers to `opacity:0`. It is also the safety net: if the animation
						// never ran for any reason, the burst is still gone afterwards.
						host.removeAttribute("data-run");
					}, burstLifetime(plan));
				} catch (error) {
					/* a cosmetic effect must never break the control */
				}
			};

			React.useEffect(function () {
				// Nothing to set up here: the node is created lazily by the first firing
				// and then kept alive by the module-level cache below. The cleanup only
				// drops the pending timer — it must NOT remove the node and must NOT null
				// the ref. Tearing the node down here was the bug that made the effect
				// vanish: the next firing then built a brand-new node and set the replay
				// flag on it, so the animation was replayed on a node the browser had
				// never painted, and the previous one was already detached.
				return function () {
					if (timerRef.current !== null) window.clearTimeout(timerRef.current);
					timerRef.current = null;
				};
			}, []);

			// STABLE IDENTITY. A fresh `fire` per render would hand out a fresh ref
			// object each time, so every call would build its own host and the replay
			// flag would land on a node nobody is looking at. One ref cell keeps the
			// host alive across re-renders — and a chip re-renders on every level
			// change, which is exactly when a burst happens.
			var fireRef = React.useRef(null);
			if (fireRef.current === null) {
				fireRef.current = function (clientX, clientY, levelIndex, maxIndex) {
					return fire(clientX, clientY, levelIndex, maxIndex);
				};
				/**
				 * The node this trigger animates, so the local test can assert that a
				 * render cycle does not replace it. `fire` keeps a stable identity, so it
				 * is a convenient place to hang this without changing the call signature.
				 */
				fireRef.current.observe = function () { return hostRef.current; };
			}
			return fireRef.current;
		}

		/** Deterministic pseudo-random sparkle field (same layout every mount). */
		function makeSparks(count, seed) {
			var out = [];
			var s = seed || 1;
			var rand = function () {
				s = (s * 1103515245 + 12345) & 0x7fffffff;
				return s / 0x7fffffff;
			};
			for (var i = 0; i < count; i++) {
				out.push({
					left: 3 + rand() * 94,
					top: 6 + rand() * 88,
					dx: (rand() * 2 - 1) * 16,
					dy: -(6 + rand() * 16),
					delay: -rand() * 2.1,
					duration: 1.5 + rand() * 1.5,
					scale: 0.7 + rand() * 0.9,
				});
			}
			return out;
		}

		/** Resolve the current model's adapter-declared reasoning levels from a snapshot. */
		function intensityOf(state) {
			var groups = Array.isArray(state.groups) ? state.groups : [];
			var current = state.current && typeof state.current === "object" ? state.current : null;
			var model = null;
			if (current) {
				for (var gi = 0; gi < groups.length; gi++) {
					if (!groups[gi] || groups[gi].id !== current.provider) continue;
					var list = Array.isArray(groups[gi].models) ? groups[gi].models : [];
					for (var mi = 0; mi < list.length; mi++) {
						if (list[mi] && list[mi].id === current.model) { model = list[mi]; break; }
					}
					break;
				}
			}
			var reasoning = model && model.reasoning ? model.reasoning : null;
			var efforts = reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
			var effectiveEffort = current === null
				? undefined
				: (current.reasoningEffort !== undefined ? current.reasoningEffort : (reasoning ? reasoning.defaultEffort : undefined));
			var currentIndex = 0;
			for (var ei = 0; ei < efforts.length; ei++) {
				if (efforts[ei] && efforts[ei].id === effectiveEffort) { currentIndex = ei; break; }
			}
			return {
				state: state,
				current: current,
				reasoning: reasoning,
				efforts: efforts,
				currentIndex: currentIndex,
				maxIndex: efforts.length - 1,
			};
		}

		/** Climb from an element to the composer card, without depending on its module hash. */
		function composerCardOf(node) {
			if (!node) return null;
			var el = node.parentElement;
			for (var i = 0; i < 7 && el; i++) {
				var cls = typeof el.className === "string" ? el.className : "";
				if (/(^|[^a-z])card([^a-z]|$)/i.test(cls)) return el;
				el = el.parentElement;
			}
			return null;
		}

		/**
		 * Max-level overdrive for the composer card: a rotating rainbow hairline plus
		 * soft colour bloom, mounted only while the slider sits at the top level and
		 * removed the moment it leaves.
		 */
		function useComposerOverdrive(anchor, active) {
			var [card, setCard] = React.useState(null);

			React.useEffect(function () {
				setCard(composerCardOf(anchor));
			}, [anchor]);

			// Depend on the resolved card, never on the holder effect's own identity:
			// re-resolving the same card must not tear the overlay down.
			var cardNode = card;
			React.useEffect(function () {
				if (!cardNode || !active) return;
				var holder = document.createElement("div");
				holder.setAttribute("class", "ti-card-overlay");
				var previousPosition = cardNode.style ? cardNode.style.position : undefined;
				var computed = "";
				try {
					computed = window.getComputedStyle(cardNode).position;
				} catch (error) {
					computed = "";
				}
				if (computed === "static" || computed === "") cardNode.style.position = "relative";
				cardNode.appendChild(holder);
				return function () {
					if (holder.parentNode === cardNode) cardNode.removeChild(holder);
					if (cardNode.style) cardNode.style.position = previousPosition;
				};
			}, [cardNode, active]);
		}

		/**
		 * The shared controller: one place that owns the store subscription, the
		 * committed level, the drag state, and the commit path.
		 */
		function useIntensity(props) {
			var store = props.store;
			var select = props.select;
			var disabled = props.disabled === true;
			var usableStore = !!store && typeof store.subscribe === "function" && typeof store.getSnapshot === "function";
			var usableSelect = typeof select === "function";

			var [level, setLevel] = React.useState(null);
			var [dragging, setDragging] = React.useState(false);
			var draggedRef = React.useRef(false);
			var [flash, setFlash] = React.useState(null);
			var [problem, setProblem] = React.useState(null);

			// The effect switches. Loaded once from storage, kept in a ref so the burst
			// path can consult them without re-subscribing, and mirrored in state so the
			// panel re-renders when they change.
			var [effects, setEffects] = React.useState(loadEffectSettings);
			var effectsRef = React.useRef(effects);
			effectsRef.current = effects;

			/**
			 * The mode key cycles 默认 → 自定义 → 关闭 → 默认, and NEVER touches the
			 * per-family checkboxes. That is the point of two primary keys: cycling out of
			 * custom mode and back must return the user's selection untouched.
			 */
			var cycleEffectMode = React.useCallback(function () {
				setEffects(function (previous) {
					var next = normalizeEffectSettings(previous);
					next.mode = nextEffectMode(next.mode);
					saveEffectSettings(next);
					return next;
				});
			}, []);

			/**
			 * A per-family checkbox. It toggles ITS OWN value and nothing else.
			 *
			 * An earlier version promoted "off" to "custom" on the first tick. That made
			 * the two keys overlap, so the mode key could no longer be used to silence
			 * everything without the checkboxes fighting it back. The keys are independent
			 * now: the mode supplies, the checkboxes allow, and they are ANDed at render
			 * time, so each control always does exactly one visible thing.
			 */
			var toggleEffect = React.useCallback(function (key) {
				setEffects(function (previous) {
					var next = normalizeEffectSettings(previous);
					next[key] = !next[key];
					saveEffectSettings(next);
					return next;
				});
			}, []);

			// The level-crossing shockwave: one viewport-fixed node, replayed per
			// crossing, so dragging back and forth can fire it without bound.
			var fireBurst = useIonBurst();
			/** The level the pointer is currently resting on (fires the burst). */
			var crossRef = React.useRef(null);
			/** Rate guard: rapid drift and flicking must not stack frames. */
			var lastBurstRef = React.useRef(0);

			/**
			 * Fire a burst if the pointer crossed into a different level.
			 *
			 * `force` is for keyboard and click moves with no pointer position: those
			 * still cross levels, so they still get the effect (centred on screen).
			 */
			var announceCross = function (value, clientX, clientY, force) {
				// The switches own the burst too: with the family off, a crossing fires
				// nothing at all.
				if (!effectEnabled(effectsRef.current, "burst")) return;
				var index = Math.round(value);
				var previous = crossRef.current;
				if (!force && previous === index) return;
				crossRef.current = index;
				if (previous === null && !force) return;
				try {
					var now = Date.now();
					if (now - lastBurstRef.current < 60) return;
					lastBurstRef.current = now;
					fireBurst(clientX, clientY, index, maxIndex);
				} catch (error) {
					/* the effect is cosmetic */
				}
			};

			React.useEffect(function () {
				try {
					if (typeof props.load === "function") props.load();
				} catch (error) {
					/* loading is best-effort; the store reports its own state */
				}
			}, []);

			var state = React.useSyncExternalStore(
				usableStore ? function (listener) { return store.subscribe(listener); } : function () { return function () {}; },
				usableStore ? function () { return store.getSnapshot(); } : function () { return EMPTY_SNAPSHOT; },
			);
			var model = intensityOf(state);

			var currentIndex = model.currentIndex;
			var effectiveEffort = model.current === null ? undefined : model.current.reasoningEffort;
			var maxIndex = model.maxIndex;

			React.useEffect(function () {
				if (flash === null) return;
				var t = window.setTimeout(function () { setFlash(null); }, 1400);
				return function () { window.clearTimeout(t); };
			}, [flash]);

			var shown = level === null ? currentIndex : level;
			if (maxIndex < 0) shown = 0;
			else if (shown > maxIndex) shown = maxIndex;

			/**
			 * The resident aura follows the level the user is looking at, not the one the
			 * host has confirmed: the ambient layer is the feedback for the drag, so it
			 * must move with the thumb. `disabled` (a subagent session) and a model with
			 * no reasoning levels both resolve to the "off" tier, which renders nothing.
			 */
			var effectiveMax = disabled || !model.reasoning ? 0 : maxIndex;
			// The switches are applied to the recipe, not to the styling: with everything
			// off this produces exactly the off rung's plan, so the screen matches the
			// lowest level with no second code path to keep in sync.
			var rawPlan = ambientPlan(disabled || !model.reasoning ? 0 : shown, effectiveMax);
			var ambient = applyEffectFilter(rawPlan, effects);
			// What the CURRENT LEVEL supplies, which is what the sub-key lamps report in
			// default mode.
			var rungSupply = rungSupplies(rawPlan);
			var ambientState = useAmbientAura(ambient, glowOf(maxIndex > 0 ? shown / maxIndex : 0), effects.mode);

			/**
			 * Write through `select`, then re-seat the local override on the level the
			 * host reports back. The override is left in place on purpose: clearing it
			 * here would snap the thumb back to the old level for the round-trip that
			 * follows (the projection updates a tick later), which reads as "the drag
			 * did not take". The clamp effect drops it once `current` catches up.
			 */
			var commit = React.useCallback(function (index) {
				if (disabled || !usableSelect) return;
				var target = model.efforts[Math.round(index)];
				if (!target || !model.current) return;
				if (target.id === effectiveEffort) { setProblem(null); return; }
				setProblem(null);
				var outcome;
				try {
					outcome = select({
						provider: model.current.provider,
						model: model.current.model,
						reasoningEffort: target.id,
					});
				} catch (error) {
					setProblem(String(error && error.message ? error.message : error));
					setLevel(null);
					return;
				}
				Promise.resolve(outcome).then(function (result) {
					if (result && result.ok === false) {
						var error = result.error || {};
						setProblem((error.code ? error.code + ": " : "") + (error.message || "切换失败"));
						setLevel(null);
						return;
					}
					// The host may normalise the level; follow whatever it accepted.
					var accepted = result && result.value && result.value.selected
						? result.value.selected.reasoningEffort
						: undefined;
					var settled = accepted === undefined ? Math.round(index) : 0;
					if (accepted !== undefined) {
						for (var i = 0; i < model.efforts.length; i++) {
							if (model.efforts[i] && model.efforts[i].id === accepted) { settled = i; break; }
						}
					}
					setLevel(settled);
					setFlash(target.name || target.id);
				}, function (error) {
					setProblem(String(error && error.message ? error.message : error));
					setLevel(null);
				});
			}, [disabled, model.current, effectiveEffort, model.efforts, select, usableSelect]);

			// Keep the freshest commit in a ref so the queue below always calls the
			// current closure.
			var commitRef = React.useRef(commit);
			commitRef.current = commit;

			/**
			 * Stale-response guard. A fast drag can leave more than one `select` in
			 * flight; only the newest may write the local level back, or an older
			 * answer would drag the thumb to wherever the user already left.
			 */
			var generationRef = React.useRef(0);
			var guardCommit = React.useCallback(function (index) {
				var generation = ++generationRef.current;
				var outcome = commitRef.current(index);
				if (outcome && typeof outcome.then === "function") {
					return outcome.then(function (value) {
						return generation === generationRef.current ? value : undefined;
					});
				}
				return outcome;
			}, []);

			/**
			 * Write only when the *level* changes, and at most one write per window.
			 *
			 * The rail reports a continuous position, so a single drag emits dozens of
			 * sub-level values. Sending each one made every change wait behind the
			 * previous round-trip, which is what read as "it sticks for a moment".
			 * Comparing the rounded level collapses those to one write per level, and
			 * `lastSentRef` suppresses duplicates across the whole gesture.
			 */
			var lastSentRef = React.useRef(null);
			var pendingRef = React.useRef(null);
			var settleTimerRef = React.useRef(null);
			var THROTTLE_MS = 120;

			/** Send the queued level now, if any. */
			var flush = function () {
				if (settleTimerRef.current !== null) {
					window.clearTimeout(settleTimerRef.current);
					settleTimerRef.current = null;
				}
				if (pendingRef.current === null) return;
				var index = pendingRef.current;
				pendingRef.current = null;
				lastSentRef.current = index;
				guardCommit(index);
			};

			/**
			 * Queue one write for the level under `value`.
			 *
			 * The first change of a gesture leaves immediately, so a single click feels
			 * instant; any further change inside the window is coalesced and sent once
			 * the position rests. Sub-level pointer noise collapses here because only
			 * the rounded level is compared.
			 *
			 * Every accepted change also announces the crossing, which is what fires the
			 * full-viewport shockwave — including crossings the coalescer would have
			 * swallowed, because the announcement happens before the write is queued.
			 */
			var requestCommit = function (value, clientX, clientY) {
				var index = Math.round(value);
				var moved = index !== lastSentRef.current;
				if (moved) announceCross(index, clientX, clientY, false);
				if (!moved && pendingRef.current === null) return;
				if (lastSentRef.current === null) {
					pendingRef.current = index;
					flush();
					return;
				}
				pendingRef.current = index;
				if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
				settleTimerRef.current = window.setTimeout(function () {
					settleTimerRef.current = null;
					flush();
				}, THROTTLE_MS);
			};

			var beginDrag = function () {
				draggedRef.current = true;
				setDragging(true);
			};
			/**
			 * End a drag. The move handler usually already wrote the current level; this
			 * guarantees the final position lands even when the pointer left the element
			 * or was released outside it.
			 */
			var endDrag = function () {
				if (!draggedRef.current) return;
				draggedRef.current = false;
				setDragging(false);
				if (settleTimerRef.current !== null) {
					window.clearTimeout(settleTimerRef.current);
					settleTimerRef.current = null;
				}
				pendingRef.current = Math.round(shownForCommitRef.current);
				flush();
			};

			// The release handler must see the newest value even though the closures
			// created during the render that installed it captured an older one.
			var shownForCommitRef = React.useRef(shown);
			shownForCommitRef.current = shown;

			// Follow the durable projection: when it reports the level we last sent, the
			// local override has done its job and is dropped.
			React.useEffect(function () {
				if (dragging) return;
				if (level !== null && level !== currentIndex) return;
				lastSentRef.current = null;
				setLevel(null);
			}, [dragging, level, currentIndex]);

			// Drop the settle timer with the component.
			React.useEffect(function () {
				return function () {
					if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
				};
			}, []);

			return {
				usableStore: usableStore,
				usableSelect: usableSelect,
				disabled: disabled,
				state: state,
				model: model,
				efforts: model.efforts,
				maxIndex: maxIndex,
				currentIndex: currentIndex,
				effectiveEffort: effectiveEffort,
				shown: shown,
				level: level,
				dragging: dragging,
				draggedRef: draggedRef,
				flash: flash,
				problem: problem,
				// The tier the aura resolved to, and the proof of what reached the DOM.
				ambient: ambient,
				ambientState: ambientState,
				effects: effects,
				rungSupply: rungSupply,
				toggleEffect: toggleEffect,
				cycleEffectMode: cycleEffectMode,
				setLevel: setLevel,
				requestCommit: requestCommit,
				beginDrag: beginDrag,
				endDrag: endDrag,
			};
		}

		/**
		 * One effect switch.
		 *
		 * Four separate facts, and the chip must not conflate them:
		 *   `on`          the lamp — the rung's supply in default mode, else the checkbox
		 *   `rendering`   whether that family actually reaches the screen right now
		 *   `suppressed`  lit, but the mode key is supplying nothing
		 *   `locked`      read-only: default mode owns the supply, so the key cannot be used
		 *
		 * Reading the lamp from the render state was one bug; letting the sub-keys stay
		 * clickable in default mode was another — the mode key is supposed to own the
		 * combination there, so the keys are drawn locked instead of pretending to work.
		 */
		function EffectChip(props) {
			var on = props.on !== false;
			var live = props.live !== false;
			var suppressed = props.suppressed === true;
			var locked = props.locked === true;
			var buttonProps = {
				type: "button",
				className: "ti-switch",
				"data-ti": "switch",
				"data-on": on ? "true" : "false",
				"data-live": live ? "true" : "false",
				"data-rendering": props.rendering === false ? "false" : "true",
				"data-suppressed": suppressed ? "true" : "false",
				"data-locked": locked ? "true" : "false",
				"data-master": props.master ? "true" : "false",
				"data-effect": props.effectKey,
				"data-state": props.state || "",
				"aria-pressed": on ? "true" : "false",
				title: chipTitle(props, on, suppressed),
			};
			if (locked) {
				// A disabled button does not fire clicks and is skipped by the tab order, which
				// is exactly the "locked" contract.
				buttonProps.disabled = true;
				buttonProps["aria-disabled"] = "true";
			} else {
				buttonProps.onClick = function () {
					if (typeof props.onToggle === "function") props.onToggle(props.effectKey);
				};
			}
			return React.createElement("button", buttonProps,
				React.createElement("i", { className: "ti-switch-dot", "aria-hidden": "true" }),
				React.createElement("span", { className: "ti-switch-text" }, props.label || props.effectKey));
		}

		/** The tooltip has to explain the mode, not just the state. */
		function chipTitle(props, on, suppressed) {
			var name = (props.master ? "主键 · " : "") + (props.label || props.effectKey);
			if (props.master) return name + "（点击切换：默认特效 → 自定义特效 → 特效关闭）";
			if (props.locked === true) return name + "（默认特效模式下由档位决定，已锁定；切到自定义可自行组合）";
			if (suppressed) return name + "（已勾选，但当前是特效关闭；取消勾选可预先设置）";
			return name + (on ? "（已勾选，点击取消）" : "（未勾选，点击勾选）");
		}

		/**
		 * The track: a pointer-driven rail. Every level gets its own slot, so the
		 * thumb travels the full width smoothly and still lands exactly on a level.
		 */
		function Slider(props) {
			var ctl = props.ctl;
			var railRef = React.useRef(null);

			/** Continuous position in levels for a client x coordinate. */
			var positionAt = function (clientX) {
				var node = railRef.current;
				if (!node || typeof node.getBoundingClientRect !== "function" || ctl.maxIndex <= 0) return 0;
				var box = node.getBoundingClientRect();
				var width = box.width || 1;
				var ratioAt = (clientX - box.left) / width;
				if (ratioAt < 0) ratioAt = 0;
				if (ratioAt > 1) ratioAt = 1;
				return ratioAt * ctl.maxIndex;
			};

			var onPointerDown = function (event) {
				if (ctl.disabled || !ctl.model.reasoning || ctl.maxIndex <= 0) return;
				if (event.pointerType === "mouse" && event.button !== undefined && event.button !== 0) return;
				try {
					if (typeof event.currentTarget.setPointerCapture === "function" && event.pointerId !== undefined) {
						event.currentTarget.setPointerCapture(event.pointerId);
					}
				} catch (error) {
					/* capture is an optimisation, not a requirement */
				}
				ctl.beginDrag();
				var position = positionAt(event.clientX);
				ctl.setLevel(position);
				// A press is an explicit move: announce and write it even though no level
				// change may have happened yet in this gesture.
				ctl.requestCommit(position, event.clientX, event.clientY);
				try {
					event.preventDefault();
				} catch (error) {
					/* ignore */
				}
			};

			var onPointerMove = function (event) {
				if (!ctl.draggedRef.current) return;
				var position = positionAt(event.clientX);
				ctl.setLevel(position);
				// Queue a write while dragging, not only on release: a pointer that
				// leaves the element (or a release the element never sees) must not lose
				// the change. `requestCommit` collapses sub-level noise into one write
				// per level and announces each crossing for the shockwave.
				ctl.requestCommit(position, event.clientX, event.clientY);
			};

			var onKeyDown = function (event) {
				if (ctl.disabled || !ctl.model.reasoning || ctl.maxIndex <= 0) return;
				var key = event.key;
				if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown" && key !== "Home" && key !== "End") return;
				var next = ctl.shown;
				if (key === "ArrowLeft" || key === "ArrowDown") next = Math.max(0, ctl.shown - 1);
				else if (key === "ArrowRight" || key === "ArrowUp") next = Math.min(ctl.maxIndex, ctl.shown + 1);
				else if (key === "Home") next = 0;
				else next = ctl.maxIndex;
				try {
					event.preventDefault();
				} catch (error) {
					/* ignore */
				}
				ctl.setLevel(next);
				ctl.requestCommit(next);
			};

			var sparks = React.useMemo(function () { return makeSparks(18, 20261013); }, []);
			var rainbow = React.useMemo(function () { return makeSparks(7, 777001); }, []);
			var ratio = ctl.maxIndex > 0 ? ctl.shown / ctl.maxIndex : 0;
			var percent = (ratio * 100).toFixed(2) + "%";
			var armed = !ctl.disabled && !!ctl.model.reasoning && ctl.maxIndex > 0;

			var ticks = [];
			for (var ti = 0; ti < ctl.efforts.length; ti++) {
				ticks.push(React.createElement("span", { className: "ti-tick", key: "t" + ti }, React.createElement("i", null)));
			}

			var sparkNodes = [];
			for (var si = 0; si < sparks.length; si++) {
				var sp = sparks[si];
				var lit = si / sparks.length <= ratio + 0.05;
				sparkNodes.push(React.createElement("span", {
					className: "ti-spark",
					key: "s" + si,
					style: {
						left: sp.left + "%",
						top: sp.top + "%",
						"--ti-dx": sp.dx.toFixed(1) + "px",
						"--ti-dy": sp.dy.toFixed(1) + "px",
						animationDelay: sp.delay.toFixed(2) + "s",
						animationDuration: sp.duration.toFixed(2) + "s",
						transform: "scale(" + sp.scale.toFixed(2) + ")",
						opacity: armed && lit ? undefined : 0.06,
					},
				}));
			}

			var rainbowNodes = [];
			for (var ri = 0; ri < rainbow.length; ri++) {
				rainbowNodes.push(React.createElement("span", {
					className: "ti-rainbow-spark",
					key: "r" + ri,
					style: {
						top: (34 + rainbow[ri].top * 0.32).toFixed(0) + "%",
						animationDelay: (-rainbow[ri].delay).toFixed(2) + "s",
					},
				}));
			}

			return React.createElement(
				"div",
				{
					ref: railRef,
					className: "ti-slider",
					// The rail owns its own geometry variables: `--ti-pct` drives the fill,
					// the particles and the thumb, and every one of those is a descendant
					// of this element. Setting them higher up would not reach them across
					// the seats' separate subtrees.
					style: Object.assign({}, SKIN.slider, {
						"--ti-pct": percent,
						"--ti-glow": glowOf(ratio),
						"--ti-level": String(ctl.shown),
						"--ti-thumb-scale": ctl.dragging ? "1.15" : "1",
					}),
					"data-disabled": ctl.disabled || !ctl.model.reasoning ? "true" : "false",
					"data-ti": "slider",
				},
				React.createElement(
					"div",
					{ className: "ti-track", style: SKIN.track },
					React.createElement("div", { className: "ti-fill" }, React.createElement("span", { className: "ti-shine" })),
					React.createElement("div", { className: "ti-ticks" }, ticks),
				),
				React.createElement("div", { className: "ti-particles" }, sparkNodes),
				React.createElement(
					"div",
					{ className: "ti-thumb" },
					React.createElement("span", { className: "ti-thumb-ring" }),
					React.createElement("span", { className: "ti-thumb-core" }),
				),
				rainbowNodes,
				// The pointer surface: owns down/move/up, so dragging works.
				React.createElement("div", {
					className: "ti-pointer",
					"data-ti": "slider-surface",
					role: "presentation",
					onPointerDown: onPointerDown,
					onPointerMove: onPointerMove,
					onPointerUp: ctl.endDrag,
					onPointerCancel: ctl.endDrag,
					onLostPointerCapture: ctl.endDrag,
				}),
				// Keyboard + accessible name. Never sees the pointer. `onInput` is the
				// belt-and-braces commit path: it fires whenever the native value moves,
				// which covers environments where pointer capture is unavailable.
				React.createElement("input", {
					className: "ti-input",
					type: "range",
					tabIndex: 0,
					min: 0,
					max: ctl.maxIndex > 0 ? ctl.maxIndex : 0,
					step: 1,
					value: Math.round(ctl.shown),
					disabled: ctl.disabled || !ctl.model.reasoning || ctl.maxIndex <= 0,
					"aria-label": "思考强度",
					"aria-valuetext": props.readoutText,
					onChange: function () { /* controlled by the rail; the rail owns the pointer */ },
					onInput: function (event) {
						var next = Number(event.target.value);
						if (!isFinite(next)) return;
						ctl.setLevel(next);
						ctl.requestCommit(next);
					},
					onKeyDown: onKeyDown,
				}),
			);
		}

		/** The panel above the composer card. */
		function ThinkIntensityDock(props) {
			var ctl = useIntensity(props);
			var [anchorNode, setAnchorNode] = React.useState(null);
			var atTop = !ctl.disabled && !!ctl.model.reasoning && ctl.maxIndex > 0 && ctl.shown === ctl.maxIndex;
			useComposerOverdrive(anchorNode, atTop);

			var measure = function (node) {
				try {
					// React calls a ref with null then the node; compare against the previous
					// value so re-attaching the same node cannot loop.
					setAnchorNode(function (previous) { return previous === node ? previous : node; });
				} catch (error) {
					/* a ref callback must never throw: React would unmount the subtree */
				}
			};

			if (!ctl.usableStore) {
				return React.createElement("div", {
					className: "ti-root", style: SKIN.root, "data-ti": "dock-root",
				}, React.createElement("div", {
					className: "ti-dock", "data-ti": "dock", "data-max": "false", style: SKIN.dock,
				}, React.createElement("div", {
					className: "ti-card", "data-ti": "card", style: SKIN.card,
				},
				React.createElement("span", { className: "ti-label" }, "思考强度"),
				React.createElement("span", { className: "ti-state", "data-kind": "error" }, "模型目录服务不可用"))));
			}

			var levelName = ctl.efforts[ctl.shown] && (ctl.efforts[ctl.shown].name || ctl.efforts[ctl.shown].id);
			var readoutText = !ctl.model.reasoning
				? "—"
				: (levelName ? String(levelName) : (ctl.effectiveEffort ? String(ctl.effectiveEffort) : "默认"));

			var status = "";
			var statusKind = "idle";
			if (ctl.disabled) { status = "子代理会话不提供推理等级"; statusKind = "muted"; }
			else if (ctl.problem !== null) { status = ctl.problem; statusKind = "error"; }
			else if (ctl.state.status === "loading") { status = "正在读取模型目录…"; statusKind = "muted"; }
			else if (ctl.state.status === "selecting") { status = "正在写入推理等级…"; statusKind = "busy"; }
			else if (ctl.flash !== null) { status = "已切到 " + ctl.flash + "，并保存为默认"; statusKind = "ok"; }
			else if (!ctl.model.reasoning) { status = "当前模型不提供推理等级"; statusKind = "muted"; }
			else if (atTop) { status = "过载：全功率推理已上线"; statusKind = "max"; }

			return React.createElement(
				"div",
				{
					className: "ti-root ti-dock-root",
					"data-ti": "dock-root",
					style: Object.assign({}, SKIN.root, {
						"--ti-glow": glowOf(ctl.maxIndex > 0 ? ctl.shown / ctl.maxIndex : 0),
					}),
				},
				React.createElement(
					"div",
					{
						className: "ti-dock",
						"data-ti": "dock",
						"data-max": atTop ? "true" : "false",
						"data-dragging": ctl.dragging ? "true" : "false",
						"data-busy": ctl.state.status === "selecting" ? "true" : "false",
						style: SKIN.dock,
					},
					React.createElement("span", { ref: measure, className: "ti-anchor", style: SKIN.anchor, "aria-hidden": "true" }),
					React.createElement("div", { className: "ti-grid-glow" }),
					React.createElement(
						"div",
						{ className: "ti-card", "data-ti": "card", style: SKIN.card },
						React.createElement("div", { className: "ti-overdrive" }),
						React.createElement(
							"div",
							{ className: "ti-head" },
							React.createElement("span", { className: "ti-label" }, "思考强度"),
							atTop ? React.createElement("span", { className: "ti-badge" }, "MAX") : null,
						),
						React.createElement(Slider, { ctl: ctl, readoutText: readoutText }),
						React.createElement("span", { className: "ti-readout", title: "当前推理等级" }, readoutText),
					),
					React.createElement("span", { className: "ti-state", "data-kind": statusKind }, status),
				),
			);
		}

		/**
		 * The compact seat in the composer tool row: a chip that opens the same rail
		 * in a small popover, so the control lives beside the official model selector.
		 */
		/**
		 * The popover's body: header, rail, ladder strip, the switch row, and the trace.
		 *
		 * It is its own component so the switch logic is testable without having to flip the
		 * popover open first — the local test renders this directly. It also keeps the whole
		 * panel consistent: the ladder strip and the lamps read from the SAME filter the aura
		 * uses, so the panel can never advertise an effect that is not on screen.
		 */
		function IntensityPanel(props) {
			var ctl = props.ctl;
			var readoutText = props.readoutText;
			var mode = ctl.effects.mode;
			// In default mode the lamps are a readout OF THE RUNG, because the rung owns the
			// combination there and the checkboxes are ignored. Every other mode draws them from
			// the checkboxes, which are what decide the combination.
			var fromRung = effectsFromRung(ctl.effects);
			var chips = [React.createElement(EffectChip, {
				effectKey: "mode",
				key: "eff-mode",
				on: mode !== EFFECT_MODE_OFF,
				master: true,
				state: mode,
				label: EFFECT_MODE_LABELS[mode] || EFFECT_MODE_LABELS[EFFECT_MODE_DEFAULT],
				onToggle: ctl.cycleEffectMode,
			})];
			EFFECT_KEYS.forEach(function (key) {
				var checked = effectChecked(ctl.effects, key);
				var rendering = effectEnabled(ctl.effects, key);
				var lit = fromRung ? (ctl.rungSupply ? ctl.rungSupply[key] === true : false) : checked;
				chips.push(React.createElement(EffectChip, {
					effectKey: key,
					key: "eff-" + key,
					on: lit,
					rendering: rendering,
					suppressed: lit && !rendering,
					// The keys stay clickable in every mode: in default mode a click is a
					// no-op on the render (the rung owns it) but it arms the selection that
					// custom mode will use, so it is not a dead control.
					live: true,
					label: EFFECT_LABELS[key],
					onToggle: ctl.toggleEffect,
				}));
			});
			chips.push(React.createElement(EffectChip, {
				effectKey: "burst",
				key: "eff-burst",
				on: effectChecked(ctl.effects, "burst"),
				rendering: effectEnabled(ctl.effects, "burst"),
				suppressed: effectChecked(ctl.effects, "burst") && !effectEnabled(ctl.effects, "burst"),
				// The burst is outside the two primary keys: it is always live.
				live: true,
				label: EFFECT_LABELS.burst,
				onToggle: ctl.toggleEffect,
			}));

			return React.createElement("div", {
				className: "ti-dock",
				"data-ti": "dock",
				"data-max": ctl.maxIndex > 0 && ctl.shown === ctl.maxIndex ? "true" : "false",
				"data-dragging": ctl.dragging ? "true" : "false",
				style: SKIN.popBody,
			},
			React.createElement("div", { style: SKIN.popRow },
				React.createElement("span", { className: "ti-label" }, "思考强度"),
				ctl.maxIndex > 0 && ctl.shown === ctl.maxIndex
					? React.createElement("span", { className: "ti-badge" }, "MAX")
					: null,
				React.createElement("span", { className: "ti-readout" }, readoutText)),
			React.createElement(Slider, { ctl: ctl, readoutText: readoutText }),
			// The ladder strip: one cell per declared level, lit where the effect actually
			// renders under the current switches.
			React.createElement("div", {
				className: "ti-ladder",
				"data-ti": "ladder",
				title: "带光点的档位才有全屏特效",
			}, ctl.efforts.map(function (effort, index) {
				var cell = applyEffectFilter(ambientPlan(index, ctl.maxIndex), ctl.effects);
				return React.createElement("span", {
					className: "ti-ladder-cell",
					key: "lv" + index,
					"data-lit": cell.on ? "true" : "false",
					"data-here": index === ctl.shown ? "true" : "false",
					title: (effort && (effort.name || effort.id) ? String(effort.name || effort.id) : "档 " + index)
						+ "：" + (cell.on ? cell.label : "无特效"),
				}, cell.on ? React.createElement("i", null) : null);
			})),
			React.createElement("div", {
				className: "ti-switches",
				"data-ti": "switches",
				"data-locked": "false",
				"data-from-rung": fromRung ? "true" : "false",
				role: "group",
				"aria-label": "特效开关",
			}, chips),
			React.createElement("div", {
				className: "ti-hint",
				"data-kind": ctl.problem !== null ? "error" : "idle",
			}, ctl.problem !== null
				? ctl.problem
				: (ctl.flash !== null ? "已切到 " + ctl.flash + "，并保存为默认" : "拖动轨道切换推理等级；拖到最右会进入过载流彩")),
			// One compact status line: which effect is live at which rung, and in which mode.
			// Enough to answer "is the effect on?" at a glance, which is all the panel needs.
			React.createElement("div", {
				className: "ti-hint ti-hint-trace",
				"data-ti": "ambient-trace",
				"data-kind": ctl.ambientState && ctl.ambientState.on ? "ok" : "idle",
			}, "氛围光：" + (ctl.ambient && ctl.ambient.label ? ctl.ambient.label : "—")
				+ " · 档 " + String(ctl.ambient ? ctl.ambient.rung : "?")
				+ " · " + (ctl.ambientState ? (ctl.ambientState.on ? "已开启" : "静音") : "尚未应用")
				+ " · 模式 " + (EFFECT_MODE_LABELS[mode] || mode)));
		}

		/**
		 * The chip seat: a compact control in the composer tool row that opens the panel.
		 */
		function ThinkIntensityChip(props) {
			var ctl = useIntensity(props);
			// `initialOpen` is only ever set by the local test, whose renderer cannot flip a
			// component's own state the way React can. It defaults to closed in production.
			var [open, setOpen] = React.useState(props.initialOpen === true);
			var rootRef = React.useRef(null);
			var popRef = React.useRef(null);

			// Keep the popover inside the viewport: the composer tool row sits near the
			// bottom of the window, so a fixed-width panel could overflow the edge. The
			// clamp runs on open and on resize, never during a drag.
			React.useLayoutEffect(function () {
				if (!open) return;
				var place = function () {
					try {
						var node = popRef.current;
						if (!node || typeof node.getBoundingClientRect !== "function") return;
						var box = node.getBoundingClientRect();
						var overflow = box.right - (window.innerWidth - 12);
						node.style.marginRight = overflow > 0 ? "-" + Math.ceil(overflow) + "px" : "";
					} catch (error) {
						/* placement is cosmetic */
					}
				};
				place();
				window.addEventListener("resize", place);
				return function () { window.removeEventListener("resize", place); };
			}, [open]);

			React.useEffect(function () {
				if (!open) return;
				var onDown = function (event) {
					try {
						var root = rootRef.current;
						if (root && event.target && root.contains(event.target)) return;
						setOpen(false);
					} catch (error) {
						/* ignore */
					}
				};
				var onKey = function (event) { if (event.key === "Escape") setOpen(false); };
				document.addEventListener("pointerdown", onDown, true);
				document.addEventListener("keydown", onKey, true);
				return function () {
					document.removeEventListener("pointerdown", onDown, true);
					document.removeEventListener("keydown", onKey, true);
				};
			}, [open]);

			var levelName = ctl.efforts[ctl.shown] && (ctl.efforts[ctl.shown].name || ctl.efforts[ctl.shown].id);
			var readoutText = !ctl.model.reasoning
				? "—"
				: (levelName ? String(levelName) : (ctl.effectiveEffort ? String(ctl.effectiveEffort) : "默认"));

			var dots = [];
			var count = ctl.efforts.length > 0 ? ctl.efforts.length : 1;
			for (var i = 0; i < count; i++) {
				dots.push(React.createElement("span", {
					className: "ti-chip-dot",
					key: "d" + i,
					"data-on": i <= ctl.shown ? "true" : "false",
				}));
			}

			var disabled = ctl.disabled || !ctl.model.reasoning || ctl.maxIndex <= 0;

			return React.createElement(
				"div",
				{
					ref: rootRef,
					className: "ti-slot",
					"data-ti": "chip-root",
					style: Object.assign({}, SKIN.slot, {
						"--ti-glow": glowOf(ctl.maxIndex > 0 ? ctl.shown / ctl.maxIndex : 0),
					}),
				},
				open && !disabled ? React.createElement(
					"div",
					{
						ref: popRef,
						className: "ti-pop",
						style: SKIN.pop,
						"data-ti": "popover",
						"data-effects": ctl.effects.mode,
					},
					React.createElement(IntensityPanel, { ctl: ctl, readoutText: readoutText }),
				) : null,
				React.createElement(
					"button",
					{
						type: "button",
						className: "ti-chip",
						disabled: disabled,
						"aria-expanded": open ? "true" : "false",
						title: disabled ? "当前会话不可调节思考强度" : "调整思考强度",
						onClick: function () { setOpen(function (previous) { return !previous; }); },
					},
					React.createElement("span", { className: "ti-chip-label" }, "强度"),
					React.createElement("span", { className: "ti-chip-value" }, readoutText),
					React.createElement("span", { className: "ti-chip-meter" }, dots),
				),
			);
		}

		/**
		 * Error boundary around both seats.
		 *
		 * React's own slot boundary swallows a render crash, which produced the
		 * symptom "the entry reached step 4 and the DOM stayed empty" with no cause
		 * anywhere. This one paints the reason into a visible block.
		 */
		class Boundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { failed: false, detail: "" };
			}

			static getDerivedStateFromError(error) {
				// Static, so it cannot be skipped: whatever came out of the crashing
				// render becomes state and is painted into the fallback below.
				return { failed: true, detail: String(error && error.stack ? error.stack : error) };
			}

			render() {
				if (this.state.failed) {
					return React.createElement("div", {
						"data-ti": "error",
						"data-error": this.state.detail,
						style: SKIN.error,
					}, "思考强度控件渲染失败：" + this.state.detail);
				}
				var Inner = this.props.inner;
				return React.createElement(Inner, {
					store: this.props.store,
					select: this.props.select,
					load: this.props.load,
					disabled: this.props.disabled,
				});
			}
		}

		function guarded(Inner) {
			return function GuardedIntensity(props) {
				return React.createElement(Boundary, {
					inner: Inner,
					store: props.store,
					select: props.select,
					load: props.load,
					disabled: props.disabled,
				});
			};
		}

		/**
		 * Test-only probe. It drives the real hook and hands the caller both the trigger
		 * and the node the trigger actually lands on, so the local test can prove the
		 * node survives a render cycle instead of only proving the markup is right.
		 */
		function IonBurstProbe(props) {
			props.sink.fire = useIonBurst();
			props.sink.observe = props.sink.fire.observe;
			return null;
		}

		// The module table reads these; `module.exports` is the same object.
		exports.ThinkIntensityDock = guarded(ThinkIntensityDock);
		exports.ThinkIntensityChip = guarded(ThinkIntensityChip);
		// Exported for the local test: it asserts the rail owns its geometry
		// variables, which is the regression that pinned the thumb at the far left.
		exports.Slider = Slider;
		exports.burstColors = burstColors;
		// The burst's decision and DOM halves, exported so the local test can drive
		// them directly. They are plain data and plain DOM — no renderer, no hooks and
		// no layout — which is why the test does not need to go through the seats.
		exports.burstPlan = burstPlan;
		exports.ambientPlan = ambientPlan;
		exports.createAmbientHost = createAmbientHost;
		exports.applyAmbient = applyAmbient;
		exports.paintAmbient = paintAmbient;
		exports.fillAmbientPool = fillAmbientPool;
		exports.buildAmbientShape = buildAmbientShape;
		exports.ambRand = ambRand;
		exports.sinkAmbientBehind = sinkAmbientBehind;
		exports.createBurstHost = createBurstHost;
		exports.armBurstLayers = armBurstLayers;
		exports.ION_LAYER_CLASSES = ION_LAYER_CLASSES;
		exports.IonBurstProbe = IonBurstProbe;
		// The effect switches. `applyEffectFilter` is the guarantee that "all off" equals
		// the lowest rung, so it is asserted rather than eyeballed.
		exports.EFFECT_KEYS = EFFECT_KEYS;
		exports.EFFECT_MODES = EFFECT_MODES;
		exports.EFFECT_MODE_DEFAULT = EFFECT_MODE_DEFAULT;
		exports.EFFECT_MODE_CUSTOM = EFFECT_MODE_CUSTOM;
		exports.EFFECT_MODE_OFF = EFFECT_MODE_OFF;
		exports.EFFECT_MODE_LABELS = EFFECT_MODE_LABELS;
		exports.coerceEffectMode = coerceEffectMode;
		exports.nextEffectMode = nextEffectMode;
		exports.effectsAreCustom = effectsAreCustom;
		exports.effectsFromRung = effectsFromRung;
		exports.chipTitle = chipTitle;
		exports.EFFECT_LABELS = EFFECT_LABELS;
		exports.EFFECT_STORE_KEY = EFFECT_STORE_KEY;
		exports.defaultEffectSettings = defaultEffectSettings;
		exports.normalizeEffectSettings = normalizeEffectSettings;
		exports.loadEffectSettings = loadEffectSettings;
		exports.saveEffectSettings = saveEffectSettings;
		exports.effectEnabled = effectEnabled;
		exports.effectChecked = effectChecked;
		exports.rungSupplies = rungSupplies;
		exports.shapeBrightness = shapeBrightness;
		exports.SHAPE_BRIGHTNESS = SHAPE_BRIGHTNESS;
		exports.modeSupply = modeSupply;
		exports.applyEffectFilter = applyEffectFilter;
		exports.EffectChip = EffectChip;
		// The popover body is its own component so the switch logic is testable without
		// having to flip the popover open first.
		exports.IntensityPanel = IntensityPanel;
		exports.CUSTOM_SUPPLY = CUSTOM_SUPPLY;
		exports.CUSTOM_SUPPLY_TIER = CUSTOM_SUPPLY_TIER;
		exports.ambientSignature = ambientSignature;
		exports.AMB_POOLS = AMB_POOLS;
		exports.composerCardOf = composerCardOf;
		exports.SKIN = SKIN;
		return module.exports;
	},
});
