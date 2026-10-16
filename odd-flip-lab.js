(function () {
  "use strict";
  const core = globalThis.InwardOddFlip;
  const $ = id => document.getElementById(id);
  const svgNS = "http://www.w3.org/2000/svg";
  let current = null;
  let revision = 0;
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
  const coord = (value, bounds) => 20 + 960 * core.position(value, bounds.low, bounds.high);
  function card(route, original, best, bounds) {
    const article = element("article", "route");
    const head = element("div", "route-head"), title = element("div");
    title.append(element("small", "", `Reading ${String(route.index + 1).padStart(2, "0")} / start ${original}`),
      element("h3", "", `Move reading ${route.index + 1}`));
    head.append(title);
    if (best && best.index === route.index) head.append(element("span", "badge", "Nearest route"));
    const verdict = element("div", "route-verdict");
    verdict.append(element("strong", "", route.threshold === null ?
      `No reversal in [${bounds.low}, ${bounds.high}]` : `${route.distance} units to tie`),
      element("span", "", route.threshold === null ? "This reading alone cannot reverse the starting winner." :
        `Tie at ${route.threshold} · strict opposing witness ${route.witness}`));
    const svg = svgElement("svg", {viewBox: "0 0 1000 48", role: "img", "aria-label":
      `Reading ${route.index + 1} starts at ${original}. ` +
      (route.threshold === null ? "No strict reversal." : `Tie at ${route.threshold}; opposing witness ${route.witness}.`)});
    svg.append(svgElement("rect", {x: 20, y: 20, width: 960, height: 17, fill: "#223a48"}));
    route.intervalWinners.forEach((winner, i) => {
      const x = coord(route.knots[i], bounds), end = coord(route.knots[i + 1], bounds);
      svg.append(svgElement("rect", {x, y: 20, width: Math.max(0, end - x), height: 17,
        fill: winner === "Mean" ? "#6ce4c4" : winner === "Median" ? "#8dc8f8" : "#f6c477"}));
    });
    svg.append(svgElement("line", {x1: coord(original, bounds), x2: coord(original, bounds), y1: 6, y2: 43,
      stroke: "#fff", "stroke-width": 3}));
    if (route.threshold !== null) svg.append(svgElement("circle", {cx: coord(route.threshold, bounds), cy: 28.5,
      r: 7, fill: "#f6c477", stroke: "#11283a", "stroke-width": 2}));
    const axis = element("div", "axis"); axis.append(element("span", "", bounds.low), element("span", "", bounds.high));
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
    const bounds = inputs.bounds || {low: "0", high: "100"};
    $("input-facts").replaceChildren(...inputs.readings.map((reading, i) =>
      element("span", "", `r${i + 1} = ${reading}`)), element("span", "", `target = ${inputs.target}`),
      element("span", "", `movement ∈ [${bounds.low}, ${bounds.high}]`),
      element("span", "", inputs.readings.length % 2 ? "Median: middle reading" :
        "Median: average of central pair"));
    const best = claim.best;
    $("result-label").textContent = claim.kind === "baseline-tie" ? "Starting outcome" : "Strict reversal infimum";
    $("result-value").textContent = claim.kind === "baseline-tie" ? "Already tied" :
      best ? `${best.distance} units to tie` : "No one-reading flip";
    $("result-explanation").textContent = claim.kind === "baseline-tie" ?
      "The original mean and median have equal error at your chosen target. No strict baseline winner exists to reverse." :
      best ? `The ${claim.baseline.toLowerCase()} starts closer. Moving reading ${best.index + 1} from ${inputs.readings[best.index]} to ${best.threshold} ties; ${best.witness} strictly reverses it.` :
        `The ${claim.baseline.toLowerCase()} starts closer, and no single reading can make the other estimate win within [${bounds.low}, ${bounds.high}].`;
    $("result-summary").textContent = claim.kind === "baseline-tie" ?
      "Starting verdict: tie. Reversal routes require a strict starting winner." :
      `Starting verdict: ${claim.baseline}. All ${claim.routes.length} movable readings are partitioned over [${bounds.low}, ${bounds.high}].`;
    $("routes").replaceChildren(...claim.routes.map(route => card(route, inputs.readings[route.index], best, bounds)));
    $("download").disabled = false;
    $("save-local").disabled = false;
  }
  function clearResult() {
    revision++;
    current = null;
    $("download").disabled = true;
    $("save-local").disabled = true;
    $("save-status").textContent = "";
    $("result-value").textContent = "Analyze inputs";
    $("result-explanation").textContent = "The inputs changed. Analyze again to create a certificate for these values.";
    $("result-summary").textContent = "No certificate for the current inputs.";
    $("routes").replaceChildren(); $("input-facts").replaceChildren();
  }
  function analyze(event) {
    if (event) event.preventDefault();
    clearResult(); $("input-error").textContent = "";
    try {
      const raw = $("readings").value.split(",").map(s => s.trim());
      const low = $("low").value.trim(), high = $("high").value.trim();
      current = low === "0" && high === "100" ? core.certificate(raw, $("target").value.trim()) :
        core.certificate(raw, $("target").value.trim(), low, high);
      render(current);
    } catch (error) {
      $("input-error").textContent = error.message;
      $("result-value").textContent = "Check inputs";
      $("result-explanation").textContent = "The previous result has been cleared. Correct the values and analyze again.";
      $("result-summary").textContent = "No certificate for the current inputs.";
    }
  }
  $("flip-form").addEventListener("submit", analyze);
  for (const id of ["readings", "target", "low", "high"]) {
    $(id).addEventListener("input", clearResult);
  }
  $("even-example").addEventListener("click", () => {
    $("readings").value = "40, 45, 50, 80"; $("target").value = "50";
    $("low").value = "0"; $("high").value = "100"; analyze();
  });
  $("mean-example").addEventListener("click", () => {
    $("readings").value = "40, 42, 50, 60, 68"; $("target").value = "52";
    $("low").value = "0"; $("high").value = "100"; analyze();
  });
  $("tie-example").addEventListener("click", () => {
    $("readings").value = "40, 45, 50, 55, 60"; $("target").value = "50";
    $("low").value = "0"; $("high").value = "100"; analyze();
  });
  $("signed-example").addEventListener("click", () => {
    $("readings").value = "-2, -1, 0, 1, 35"; $("target").value = "0";
    $("low").value = "-10"; $("high").value = "40"; analyze();
  });
  $("download").addEventListener("click", () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2) + "\n"], {type: "application/json"}));
    const link = element("a"); link.href = url; link.download = "odd-sample-flip-certificate.json";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("save-local").addEventListener("click", async () => {
    if (!current) return;
    const atStart = revision;
    const source = JSON.stringify(current, null, 2) + "\n";
    $("save-local").disabled = true;
    $("save-status").textContent = "Independently checking and saving on this device…";
    let database;
    try {
      if (!globalThis.InwardResearchArchive || !globalThis.InwardOddFlipVerifier ||
          !globalThis.TargetLensVerifier || !globalThis.crypto?.subtle) {
        throw new Error("Local archive verification is unavailable in this browser.");
      }
      const archive = globalThis.InwardResearchArchive;
      database = await archive.open();
      // A changed form can invalidate this action while IndexedDB is opening.
      if (atStart !== revision) return;
      const saved = await archive.add(database, source, "", {
        sampleReversal: globalThis.InwardOddFlipVerifier,
        strictJson: globalThis.TargetLensVerifier.parseReceipt
      }, globalThis.crypto);
      if (atStart === revision) $("save-status").textContent = saved.created ?
        `Independently checked and saved locally. Fingerprint: ${saved.digest}.` :
        `Already in your local archive. Fingerprint: ${saved.digest}.`;
    } catch (error) {
      if (atStart === revision) $("save-status").textContent = `Not saved: ${error.message}`;
    } finally {
      database?.close();
      if (atStart === revision) $("save-local").disabled = !current;
    }
  });
  $("print").addEventListener("click", () => window.print());
  analyze();
})();
