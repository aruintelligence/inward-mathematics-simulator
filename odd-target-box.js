(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const svgNS = "http://www.w3.org/2000/svg";
  let latest = null;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function svg(tag, attrs) {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  function chart(route, inputs) {
    const figure = element("figure");
    const plot = svg("svg", {viewBox: "0 0 600 190", role: "img",
      "aria-label": `Reading ${route.index + 1}: exact witness positions within the movement and target ranges`});
    const x = value => 45 + 520 * InwardTargetBox.position(value, inputs.movement.low, inputs.movement.high);
    const y = value => inputs.target.low === inputs.target.high ? 94 :
      164 - 140 * InwardTargetBox.position(value, inputs.target.low, inputs.target.high);
    if (route.stability?.baseline) {
      const left = x(route.stability.left.limit), right = x(route.stability.right.limit);
      plot.append(svg("rect", {x: left, y: 24, width: Math.max(0, right - left),
        height: 140, fill: "#40cfa7", opacity: ".17"}));
    }
    plot.append(svg("rect", {x: 45, y: 24, width: 520, height: 140, fill: "none", stroke: "currentColor", opacity: ".45"}));
    for (const value of route.knots) {
      const line = svg("line", {x1: x(value), x2: x(value), y1: 24, y2: 164,
        stroke: "currentColor", opacity: ".23", "stroke-width": 1});
      plot.append(line);
    }
    for (const name of route.reachable) {
      const witness = route.witnesses[name];
      const color = {Mean: "#40cfa7", Median: "#8abffd", Tie: "#f2b85c"}[name];
      const marker = svg("circle", {cx: x(witness.reading), cy: y(witness.target), r: 8,
        fill: color, stroke: "#10283a", "stroke-width": 2});
      const tooltip = svg("title", {});
      tooltip.textContent = `${name} at reading ${witness.reading}, target ${witness.target}`;
      marker.append(tooltip);
      plot.append(marker);
    }
    figure.append(plot);
    figure.append(element("figcaption", "Horizontal: moved reading. Vertical: target. Lines mark exact partition knots; dots are certified witnesses. A shaded band, when present, is the strict baseline region; its exact boundary status is given below."));
    return figure;
  }
  function show(record) {
    latest = record;
    const {inputs, claim} = record;
    const guaranteedRoutes = claim.routes.filter(route => route.guarantee);
    $("headline").textContent = claim.guarantee ? `${claim.guarantee} throughout` :
      `${claim.reachable.length} reachable outcome${claim.reachable.length === 1 ? "" : "s"}`;
    $("headline-detail").textContent = claim.guarantee ?
      "A strict winner for every permitted one-reading move and target." :
      `${guaranteedRoutes.length} of ${claim.routes.length} individual routes have a strict winner throughout the target box.`;
    $("summary-copy").textContent = "Exact outcomes across all routes: " + claim.reachable.join(", ") +
      ". A route marked guaranteed has the same strict winner for every real value in its rectangle.";
    $("gap-summary").textContent = claim.gap ?
      `Exact squared-error gap D = (mean − target)² − (median − target)² spans [${claim.gap.min.value}, ${claim.gap.max.value}] across every route. Minimum: reading ${claim.gap.min.index + 1} at ${claim.gap.min.reading}, target ${claim.gap.min.target}. Maximum: reading ${claim.gap.max.index + 1} at ${claim.gap.max.reading}, target ${claim.gap.max.target}. Negative favors Mean; positive favors Median. These bounds are attained.` :
      "Choose Quantify exact gap to certify the attained worst and best squared-error difference.";
    const stability = claim.stability;
    $("stability-summary").textContent = stability ? stability.nearestFailure ? stability.baseline ?
      `Original verdict across the target interval: ${stability.baseline}. First possible tie after a one-reading movement of ${stability.nearestFailure.distance}: reading ${stability.nearestFailure.index + 1}, ${stability.nearestFailure.side}, at ${stability.nearestFailure.reading} with target ${stability.nearestFailure.target}. All smaller permitted absolute movements preserve the strict verdict.` :
      `No strict winner holds across the target interval at the original readings. A tie already occurs at target ${stability.nearestFailure.target}; stability distance is zero.` :
      `Original verdict: ${stability.baseline}. No tie or change is possible anywhere in the specified movement range, moving one reading at a time.` :
      "Choose Find first failure to certify exact movement thresholds from the original readings.";
    const facts = $("facts"); facts.replaceChildren();
    for (const value of [`${inputs.readings.length} readings`,
      inputs.readings.length % 2 ? "Median: middle reading" : "Median: central-pair average",
      `Movement [${inputs.movement.low}, ${inputs.movement.high}]`,
      `Target [${inputs.target.low}, ${inputs.target.high}]`,
      `${guaranteedRoutes.length} guaranteed routes`]) facts.append(element("span", value));
    const routes = $("routes"); routes.replaceChildren();
    for (const route of claim.routes) {
      const card = element("article", undefined, "route");
      const head = element("div", undefined, "route-head");
      const label = element("div"); label.append(element("small", `Reading ${route.index + 1}`));
      label.append(element("h3", `Start: ${inputs.readings[route.index]}`));
      head.append(label, element("span", route.guarantee ? `${route.guarantee} throughout` : "Outcome varies",
        route.guarantee ? "badge guarantee" : "badge"));
      card.append(head);
      const pills = element("div", undefined, "pills");
      for (const outcome of route.reachable) pills.append(element("span", outcome, `pill ${outcome.toLowerCase()}`));
      card.append(pills, chart(route, inputs));
      const list = element("ul");
      for (const outcome of route.reachable) {
        const witness = route.witnesses[outcome];
        const item = element("li");
        item.append(document.createTextNode(`${outcome} witness: moved reading `));
        item.append(element("code", witness.reading));
        item.append(document.createTextNode(", target "));
        item.append(element("code", witness.target));
        list.append(item);
      }
      card.append(list, element("p", `${route.knots.length} exact partition knots: ${route.knots.join(" · ")}`, "meta"));
      if (route.gap) card.append(element("p",
        `Exact D range [${route.gap.min.value}, ${route.gap.max.value}]. Minimum at x=${route.gap.min.reading}, t=${route.gap.min.target}; maximum at x=${route.gap.max.reading}, t=${route.gap.max.target}.`, "meta"));
      if (route.stability) {
        const describe = side => {
          const part = route.stability[side];
          return `${side} ${part.limit} (${part.included ? "included: still strict" :
            `excluded: tie at target ${part.witness.target}`})`;
        };
        card.append(element("p", route.stability.baseline ?
          `From ${inputs.readings[route.index]}, baseline ${route.stability.baseline}; safe region: ${describe("left")}, ${describe("right")}.` :
          `At the original reading ${inputs.readings[route.index]}, no strict winner holds across all targets. Tie at target ${route.stability.left.witness.target}; stability distance is zero.`, "meta"));
      }
      routes.append(card);
    }
    $("download").disabled = false;
  }
  function analyze(event, mode = "outcomes") {
    if (event) event.preventDefault();
    try {
      const readings = $("readings").value.split(",").map(part => part.trim());
      const constructor = mode === "gap" ? InwardTargetBox.gapCertificate :
        mode === "stability" ? InwardTargetBox.stabilityCertificate : InwardTargetBox.certificate;
      const result = constructor(
        readings, $("move-low").value.trim(),
        $("move-high").value.trim(), $("target-low").value.trim(), $("target-high").value.trim());
      $("input-error").textContent = "";
      show(result);
    } catch (error) {
      latest = null;
      $("download").disabled = true;
      $("headline").textContent = "Check the inputs";
      $("headline-detail").textContent = "The earlier result has been cleared.";
      $("summary-copy").textContent = "No certificate for these inputs.";
      $("gap-summary").textContent = "";
      $("stability-summary").textContent = "";
      $("facts").replaceChildren(); $("routes").replaceChildren();
      $("input-error").textContent = error.message;
    }
  }
  function example(values) {
    for (const [key, value] of Object.entries(values)) $(key).value = value;
    analyze();
    $("results").scrollIntoView({behavior: "smooth"});
  }
  $("box-form").addEventListener("submit", analyze);
  $("quantify").addEventListener("click", () => analyze(null, "gap"));
  $("first-failure").addEventListener("click", () => analyze(null, "stability"));
  for (const id of ["readings", "move-low", "move-high", "target-low", "target-high"]) {
    $(id).addEventListener("input", () => {
      latest = null;
      $("download").disabled = true;
      $("headline").textContent = "Analyze inputs";
      $("headline-detail").textContent = "The inputs changed. Certify the new rectangle before exporting.";
      $("summary-copy").textContent = "No certificate for the current inputs.";
      $("gap-summary").textContent = "";
      $("stability-summary").textContent = "";
      $("facts").replaceChildren(); $("routes").replaceChildren();
    });
  }
  $("locked-example").addEventListener("click", () => example({readings: "24, 13, 45, 41, 38",
    "move-low": "13", "move-high": "45", "target-low": "49", "target-high": "51"}));
  $("signed-example").addEventListener("click", () => example({readings: "-2, -1, 0, 1, 35",
    "move-low": "-10", "move-high": "40", "target-low": "-1", "target-high": "1"}));
  $("even-example").addEventListener("click", () => example({readings: "40, 45, 50, 80",
    "move-low": "0", "move-high": "100", "target-low": "48", "target-high": "52"}));
  $("download").addEventListener("click", () => {
    if (!latest) return;
    const blob = new Blob([JSON.stringify(latest, null, 2) + "\n"], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = element("a"); anchor.href = url; anchor.download = `${latest.format}.json`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("print").addEventListener("click", () => window.print());
  analyze();
})();
