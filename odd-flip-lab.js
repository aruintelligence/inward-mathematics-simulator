(function () {
  "use strict";
  const core = globalThis.InwardOddFlip;
  const $ = id => document.getElementById(id);
  const svgNS = "http://www.w3.org/2000/svg";
  let current = null;
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const svgElement = (name, attributes) => {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const coord = value => 20 + 9.6 * core.number(value);
  function card(route, original, best) {
    const article = element("article", "route");
    const head = element("div", "route-head"), title = element("div");
    title.append(element("small", "", `Reading ${String(route.index + 1).padStart(2, "0")} / start ${original}`),
      element("h3", "", `Move reading ${route.index + 1}`));
    head.append(title);
    if (best && best.index === route.index) head.append(element("span", "badge", "Nearest route"));
    const verdict = element("div", "route-verdict");
    verdict.append(element("strong", "", route.threshold === null ? "No reversal in 0–100" : `${route.distance} units to tie`),
      element("span", "", route.threshold === null ? "This reading alone cannot reverse the starting winner." :
        `Tie at ${route.threshold} · strict opposing witness ${route.witness}`));
    const svg = svgElement("svg", {viewBox: "0 0 1000 48", role: "img", "aria-label":
      `Reading ${route.index + 1} starts at ${original}. ` +
      (route.threshold === null ? "No strict reversal." : `Tie at ${route.threshold}; opposing witness ${route.witness}.`)});
    svg.append(svgElement("rect", {x: 20, y: 20, width: 960, height: 17, fill: "#223a48"}));
    route.intervalWinners.forEach((winner, i) => {
      const x = coord(route.knots[i]), end = coord(route.knots[i + 1]);
      svg.append(svgElement("rect", {x, y: 20, width: Math.max(0, end - x), height: 17,
        fill: winner === "Mean" ? "#6ce4c4" : winner === "Median" ? "#8dc8f8" : "#f6c477"}));
    });
    svg.append(svgElement("line", {x1: coord(original), x2: coord(original), y1: 6, y2: 43,
      stroke: "#fff", "stroke-width": 3}));
    if (route.threshold !== null) svg.append(svgElement("circle", {cx: coord(route.threshold), cy: 28.5,
      r: 7, fill: "#f6c477", stroke: "#11283a", "stroke-width": 2}));
    const axis = element("div", "axis"); axis.append(element("span", "", "0"), element("span", "", "100"));
    const details = element("details"), summary = element("summary", "", "Inspect exact intervals and boundary winners");
    const list = element("ol");
    route.intervalWinners.forEach((winner, i) => list.append(element("li", "",
      `(${route.knots[i]}, ${route.knots[i + 1]}) — ${winner} throughout`)));
    const points = element("p", "", route.knots.map((knot, i) =>
      `${knot}: ${route.pointWinners[i]}`).join(" · "));
    details.append(summary, list, element("strong", "", "At exact boundaries"), points);
    article.append(head, verdict, svg, axis, details);
    return article;
  }
  function render(record) {
    const {inputs, claim} = record;
    $("input-facts").replaceChildren(...inputs.readings.map((reading, i) =>
      element("span", "", `r${i + 1} = ${reading}`)), element("span", "", `target = ${inputs.target}`));
    const best = claim.best;
    $("result-label").textContent = claim.kind === "baseline-tie" ? "Starting outcome" : "Strict reversal infimum";
    $("result-value").textContent = claim.kind === "baseline-tie" ? "Already tied" :
      best ? `${best.distance} units to tie` : "No one-reading flip";
    $("result-explanation").textContent = claim.kind === "baseline-tie" ?
      "The original mean and median have equal error at your chosen target. No strict baseline winner exists to reverse." :
      best ? `The ${claim.baseline.toLowerCase()} starts closer. Moving reading ${best.index + 1} from ${inputs.readings[best.index]} to ${best.threshold} ties; ${best.witness} strictly reverses it.` :
        `The ${claim.baseline.toLowerCase()} starts closer, and no single reading can make the other estimate win within 0–100.`;
    $("result-summary").textContent = claim.kind === "baseline-tie" ?
      "Starting verdict: tie. Reversal routes require a strict starting winner." :
      `Starting verdict: ${claim.baseline}. All ${claim.routes.length} possible movable readings are partitioned over the full real interval [0,100].`;
    $("routes").replaceChildren(...claim.routes.map(route => card(route, inputs.readings[route.index], best)));
    $("download").disabled = false;
  }
  function analyze(event) {
    if (event) event.preventDefault();
    current = null; $("download").disabled = true; $("input-error").textContent = "";
    try {
      const raw = $("readings").value.split(",").map(s => s.trim());
      current = core.certificate(raw, $("target").value.trim());
      render(current);
    } catch (error) {
      $("input-error").textContent = error.message;
      $("result-value").textContent = "Check inputs";
      $("result-explanation").textContent = "The previous result has been cleared. Correct the values and analyze again.";
      $("result-summary").textContent = "No certificate for the current inputs.";
      $("routes").replaceChildren(); $("input-facts").replaceChildren();
    }
  }
  $("flip-form").addEventListener("submit", analyze);
  $("mean-example").addEventListener("click", () => {
    $("readings").value = "40, 42, 50, 60, 68"; $("target").value = "52"; analyze();
  });
  $("tie-example").addEventListener("click", () => {
    $("readings").value = "40, 45, 50, 55, 60"; $("target").value = "50"; analyze();
  });
  $("download").addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2) + "\n"], {type: "application/json"}));
    const link = element("a"); link.href = url; link.download = "odd-sample-flip-certificate.json";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("print").addEventListener("click", () => window.print());
  analyze();
})();
