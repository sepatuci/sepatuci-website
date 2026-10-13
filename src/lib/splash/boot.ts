import { isThemedPath } from "@/lib/portal/theme";

/**
 * The opening of the public site: a short splash on each real load of a
 * public page. Whether it plays is decided by an inline script in <head>
 * before anything is painted, and recorded as an attribute on <html> that
 * the stylesheet, the splash controller and the hero all key on:
 *
 *   data-splash="pending"  the page is masked and the splash is showing
 *   data-splash="handoff"  the mask is lifted; the splash is dissolving
 *   (absent)               nothing is showing, or the splash never played
 *
 * The script also arms a backstop that removes the attribute after
 * SPLASH_HARD_TIMEOUT_MS whatever happens, so no failure can leave the page
 * blank. Single-page navigations never run the script, so the attribute is
 * absent and the home page plays only its own reveals.
 */

export const SPLASH_ATTRIBUTE = "data-splash";
export const SPLASH_SEEN_KEY = "splashSeen";
export const SPLASH_MASK_ID = "splash-mask";
export const SPLASH_HARD_TIMEOUT_MS = 3500;
/** Fired on window when the mask lifts and the shell starts to dissolve. */
export const SPLASH_HANDOFF_EVENT = "splash-handoff";
/** Fired on window once the shell is gone. Heavy background effects wait for it. */
export const SPLASH_DONE_EVENT = "splash-done";

export type SplashPhase = "pending" | "handoff" | "done";

export interface SplashDecision {
  pathname: string;
  reducedMotion: boolean;
}

/** True on a public page for a person who has not asked for less motion. */
export function shouldPlaySplash({ pathname, reducedMotion }: SplashDecision): boolean {
  return !isThemedPath(pathname) && !reducedMotion;
}

/**
 * The two rules the mask needs: hide everything but the splash while it is
 * pending, and show the splash shell (display none in the stylesheet) for as
 * long as the attribute exists. Lifting the attribute undoes both at once.
 */
export const SPLASH_MASK_CSS =
  `html[${SPLASH_ATTRIBUTE}="pending"] body>*:not([data-splash-screen]){opacity:0!important;pointer-events:none}` +
  `html[${SPLASH_ATTRIBUTE}] [data-splash-screen]{display:block}`;

/**
 * Runs in <head> before the page is painted. It mirrors shouldPlaySplash;
 * boot.test.ts runs it against that function to keep the two from drifting.
 * On a sign-in or portal page, or for someone who asked for less motion, it
 * only marks the splash as seen. Otherwise it clears the flag, marks the
 * splash pending, writes the mask and arms the backstop.
 */
export const SPLASH_BOOT_SCRIPT =
  `(function(){try{` +
  `var p=location.pathname;` +
  `var r=false;try{r=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}` +
  `if(p==='/login'||p.indexOf('/login/')===0||p==='/portal'||p.indexOf('/portal/')===0||r){` +
  `try{sessionStorage.setItem('${SPLASH_SEEN_KEY}','true')}catch(e){}` +
  `return;}` +
  `try{sessionStorage.removeItem('${SPLASH_SEEN_KEY}')}catch(e){}` +
  `var h=document.documentElement;` +
  `setTimeout(function(){h.removeAttribute('${SPLASH_ATTRIBUTE}')},${SPLASH_HARD_TIMEOUT_MS});` +
  `h.setAttribute('${SPLASH_ATTRIBUTE}','pending');` +
  `var s=document.createElement('style');` +
  `s.id='${SPLASH_MASK_ID}';` +
  `s.textContent='${SPLASH_MASK_CSS}';` +
  `document.head.appendChild(s);` +
  `}catch(e){}})();`;
