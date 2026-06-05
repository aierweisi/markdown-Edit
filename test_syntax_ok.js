// Test file
const SettingsManager = (() => {
  let e = {};
  async function t() { return { theme: "light" }; }
  function r() { return window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"; }
  let u = null;
  function h() { n("system"); }
  function n(e) {
    const t = "system" === e ? r() : e,
      o = "dark" === t;
    const l = document.getElementById("btn-theme");
    if (l) {
      const i = l.querySelector("svg");
      if (i) {
        const n = "system" === e ? "a" : o ? "b" : "c";
        i.innerHTML = n;
      }
    }
    "system" === e && (u && u.removeEventListener("change", h),
      u = window.matchMedia("(prefers-color-scheme:dark)"),
      u.addEventListener("change", h));
  }
  function a(e) { return e; }
  console.log("OK");
  return {};
})();
