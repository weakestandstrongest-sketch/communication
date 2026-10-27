/**
 * Launch animation: the Jam bubble pops in, its peach shadow slides out, the J draws itself and
 * the three dots tap in like a typing indicator, then everything zooms away into the app.
 *
 * Pure HTML + CSS rendered on the server, so it is there from the first frame (no flash of the app).
 * It never takes clicks (pointer-events: none) and plays once per browser session: the inline script
 * marks <html> with `no-splash` on later page loads. Skipped for reduced motion.
 */
const BUBBLE =
  "M 512 190 C 700 190 840 320 840 490 C 840 660 700 790 512 790 C 470 790 432 783 398 770 C 360 800 316 816 268 820 C 300 790 318 760 326 726 C 262 684 184 604 184 490 C 184 320 324 190 512 190 Z";

const ONCE = `try{if(sessionStorage.getItem("jam-splash"))document.documentElement.classList.add("no-splash");else sessionStorage.setItem("jam-splash","1")}catch(e){document.documentElement.classList.add("no-splash")}`;

export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONCE }} />
      <div className="jam-splash" aria-hidden>
        <svg viewBox="0 0 1024 1024" className="jam-splash-logo">
          <path className="jam-splash-shadow" d={BUBBLE} fill="none" stroke="#F0C9B4" strokeWidth="18" strokeLinejoin="round" />
          <path className="jam-splash-bubble" d={BUBBLE} fill="#F5F3EE" />
          <path className="jam-splash-j" d="M 570 330 L 570 530 C 570 612 480 638 448 586" pathLength={1} fill="none" stroke="#111" strokeWidth="64" strokeLinecap="round" />
          <circle className="jam-splash-dot" cx="448" cy="330" r="22" fill="#E8874A" />
          <circle className="jam-splash-dot" cx="448" cy="396" r="22" fill="#E8874A" />
          <circle className="jam-splash-dot" cx="448" cy="462" r="22" fill="#E8874A" />
        </svg>
        <span className="jam-splash-word">Jam</span>
      </div>
    </>
  );
}
