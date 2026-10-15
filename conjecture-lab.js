(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const engine = globalThis.InwardConjectureLab;
  let exportBytes = null, revision = 0;
  const node = (tag, value, className) => {
    const item = document.createElement(tag);
    item.textContent = value;
    if (className) item.className = className;
    return item;
  };
  const fraction = raw => {
    const [n, d = "1"] = raw.split("/");
    return {n: BigInt(n), d: BigInt(d)};
  };
  const difference = (a, b) => ({n: a.n * b.d - b.n * a.d, d: a.d * b.d});
  const compareRaw = (a, b) => {
    const delta = difference(fraction(a), fraction(b)).n;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  };
  function scale(domain) {
    const readings = domain.readingValues, targets = domain.targetValues;
    return {low: compareRaw(readings[0], targets[0]) <= 0 ? readings[0] : targets[0],
      high: compareRaw(readings.at(-1), targets.at(-1)) >= 0 ? readings.at(-1) : targets.at(-1)};
  }
  function reset() {
    revision++;
    exportBytes = null;
    $("download").disabled = true;
    $("results").hidden = true;
    $("headline").textContent = "Ready";
    $("headline-note").textContent = "Run a new exact experiment.";
    $("search-status").textContent = "Values changed. Run the search again.";
    $("search-status").classList.remove("error");
  }
  function plot(point, axis) {
    const figure = node("figure", "", "figure");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 86");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Readings ${point.readings.join(", ")}; mean ${point.mean}; median ${point.median}; target ${point.target}`);
    const span = difference(fraction(axis.high), fraction(axis.low));
    const amount = raw => {
      const delta = difference(fraction(raw), fraction(axis.low));
      return 20 + 560 * Number(delta.n * span.d) / Number(delta.d * span.n);
      // Layout only. Integer fractions determine exact outcomes and evidence.
    };
    const shape = (type, attributes) => {
      const item = document.createElementNS("http://www.w3.org/2000/svg", type);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value));
      svg.append(item);
      return item;
    };
    shape("line", {x1:20,y1:68,x2:580,y2:68,stroke:"currentColor","stroke-width":2});
    const seen = new Map();
    point.readings.forEach(raw => {
      const stack = seen.get(raw) || 0;
      seen.set(raw, stack + 1);
      shape("circle", {cx:amount(raw),cy:45-stack*8,r:5,fill:"#53c4db"});
    });
    shape("line", {x1:amount(point.target),y1:7,x2:amount(point.target),y2:69,stroke:"#ffca73","stroke-width":2,"stroke-dasharray":"3 4"});
    shape("circle", {cx:amount(point.mean),cy:63,r:6,fill:"#70e5b8",stroke:"#081922","stroke-width":1});
    shape("rect", {x:amount(point.median)-6,y:58,width:12,height:12,fill:"#ff9b9e",stroke:"#081922","stroke-width":1});
    shape("text", {x:20,y:83,fill:"currentColor","font-size":10}).textContent = axis.low;
    shape("text", {x:580,y:83,fill:"currentColor","font-size":10,"text-anchor":"end"}).textContent = axis.high;
    figure.append(svg);
    figure.append(node("figcaption", `Readings: ${point.readings.join(", ")} · target ${point.target} · mean ${point.mean} · median ${point.median}. Winner: ${point.actualWinner}. Dots: readings; green circle: mean; rose square: median; gold line: target.`));
    return figure;
  }
  function card(candidate, axis) {
    const refuted = candidate.status === "counterexample-found";
    const item = node("article", "", refuted ? "card counterexample" : "card");
    item.append(node("span", refuted ? "Counterexample found" : "Unrefuted on this finite grid", "badge"));
    item.append(node("h3", candidate.claim));
    item.append(node("p", `${candidate.casesChecked} exact case${candidate.casesChecked === 1 ? "" : "s"} checked before ${refuted ? "the first counterexample" : "this finite search ended"}.`));
    if (refuted) {
      const witness = candidate.counterexample;
      if (candidate.id === "target-independent") {
        item.append(node("p", `The same readings reverse winner as the target changes from ${witness.first.target} to ${witness.second.target}.`, "fact"));
        item.append(plot(witness.first, axis), plot(witness.second, axis));
      } else {
        item.append(node("p", `Exact counterexample: ${witness.actualWinner} wins at target ${witness.target}.`, "fact"));
        item.append(plot(witness, axis));
      }
    } else {
      item.append(node("p", "No counterexample was found in the selected finite domain. This status does not prove the universal claim."));
    }
    return item;
  }
  async function run(event) {
    event.preventDefault();
    const started = ++revision;
    exportBytes = null;
    $("download").disabled = true;
    $("results").hidden = true;
    $("search-status").classList.remove("error");
    try {
      const report = engine.scan($("reading-values").value, $("target-values").value);
      const source = JSON.stringify(report, null, 2) + "\n";
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      if (started !== revision) return;
      const fingerprint = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
      const refuted = report.candidates.filter(item => item.counterexample).length;
      $("headline").textContent = `${refuted} / 4`;
      $("headline-note").textContent = "candidate statements refuted on this exact grid";
      $("scope-note").textContent = `${report.domain.readingMultisets} sorted five-reading multisets from ${report.domain.readingValues.join(", ")}; targets ${report.domain.targetValues.join(", ")}. Cases stop counting after the first counterexample for each statement.`;
      $("ledger").replaceChildren(node("span", `${refuted} exact counterexamples`),
        node("span", `${4 - refuted} unrefuted on this finite grid`),
        node("span", `${report.domain.readingMultisets} reading multisets`));
      const axis = scale(report.domain);
      $("cards").replaceChildren(...report.candidates.map(candidate => card(candidate, axis)));
      $("fingerprint").textContent = `SHA-256 of exported JSON bytes: ${fingerprint}`;
      $("results").hidden = false;
      exportBytes = source;
      $("download").disabled = false;
      $("search-status").textContent = "Exact search complete. Export the record for independent replay.";
    } catch (error) {
      if (started !== revision) return;
      $("headline").textContent = "Check inputs";
      $("headline-note").textContent = "No result accepted.";
      $("search-status").textContent = error.message;
      $("search-status").classList.add("error");
    }
  }
  $("search-form").addEventListener("submit", run);
  for (const id of ["reading-values", "target-values"]) $(id).addEventListener("input", reset);
  $("fraction-example").addEventListener("click", () => {
    $("reading-values").value = "0,1/2,1,3/2,2";
    $("target-values").value = "0,1/4,1/2,1,3/2,2";
    reset();
    $("reading-values").focus();
  });
  $("download").addEventListener("click", () => {
    if (!exportBytes) return;
    const url = URL.createObjectURL(new Blob([exportBytes], {type:"application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inward-conjecture-experiment-v1.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
