(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const checker = globalThis.InwardTargetBoxVerifier;
  const archive = globalThis.InwardResearchArchive;
  let file = null;
  let revision = 0;
  let lastValid = null;
  function node(tag, content, className) {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function reset(message) {
    revision++;
    lastValid = null;
    $("report").hidden = true;
    $("save-to-archive").disabled = true;
    $("save-status").textContent = "This device keeps a copy only when you choose Save.";
    $("save-status").classList.remove("error");
    $("routes").replaceChildren();
    $("fingerprint").textContent = "";
    $("seal-status").textContent = "Awaiting certificate";
    $("seal-note").textContent = "Choose a certificate or paste its complete JSON below.";
    $("status").textContent = message;
    $("status").classList.remove("error");
  }
  $("receipt-file").addEventListener("change", event => {
    file = event.target.files[0] || null;
    $("receipt-json").value = "";
    $("file-name").textContent = file ? file.name : "No file selected";
    reset(file ? "Ready to verify selected file." : "Ready to inspect a certificate.");
  });
  $("receipt-json").addEventListener("input", () => {
    file = null;
    $("receipt-file").value = "";
    $("file-name").textContent = "Using pasted JSON";
    reset("Ready to verify pasted JSON.");
  });
  async function inspect() {
    reset("Checking the complete certificate...");
    const started = revision;
    try {
      let bytes, source;
      if (file) {
        if (file.size > 2_000_000) throw new Error("Certificate exceeds the 2 MB limit.");
        bytes = new Uint8Array(await file.arrayBuffer());
        // Preserve a leading BOM, so malformed file bytes cannot be checked as different JSON.
        source = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
      } else {
        source = $("receipt-json").value;
        if (!source.trim()) throw new Error("Choose a JSON certificate or paste its complete contents.");
        bytes = new TextEncoder().encode(source);
        if (bytes.length > 2_000_000) throw new Error("Certificate exceeds the 2 MB limit.");
      }
      const record = checker.parseReceipt(source);
      const result = checker.verify(record);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (started !== revision) return; // A newer edit or file replaced this result.
      const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
      lastValid = {source, hash};
      $("save-to-archive").disabled = false;
      $("seal-status").textContent = "Mathematics verified";
      $("seal-note").textContent = `${result.routes} exhaustive routes checked with exact rational arithmetic.`;
      $("status").textContent = "Certificate accepted under its stated inputs.";
      $("reachable").textContent = result.reachable.join(" · ");
      $("overall-note").textContent = `${result.routes} readings; ${result.routes % 2 ? "middle-reading" : "central-pair average"} median; movement [${record.inputs.movement.low}, ${record.inputs.movement.high}]; target [${record.inputs.target.low}, ${record.inputs.target.high}].`;
      $("guarantee").textContent = result.guarantee || "None across all routes";
      $("guarantee-note").textContent = result.guarantee ?
        `The ${result.guarantee.toLowerCase()} is strictly closer for every permitted reading move and target in this model.` :
        "A strict winner does not hold across every route and target in this model.";
      $("report-intro").textContent = "Recomputed the complete root partition and possible outcomes for each route; checked every supplied witness by comparing exact squared errors.";
      if (result.gap) $("report-intro").textContent +=
        ` Exact attained squared-error gap D = (mean − target)² − (median − target)² spans [${result.gap.min.value}, ${result.gap.max.value}] across all routes. Minimum at reading ${result.gap.min.index + 1}, x=${result.gap.min.reading}, t=${result.gap.min.target}; maximum at reading ${result.gap.max.index + 1}, x=${result.gap.max.reading}, t=${result.gap.max.target}. Negative favors Mean; positive favors Median.`;
      if (result.stability) {
        const {baseline, nearestFailure} = result.stability;
        $("report-intro").textContent += nearestFailure ?
          ` Starting verdict across the target interval: ${baseline || "no strict winner"}. Nearest tie after a one-reading movement of ${nearestFailure.distance}, route ${nearestFailure.index + 1} (${nearestFailure.side}) at x=${nearestFailure.reading}, t=${nearestFailure.target}. This boundary itself is not a strict win.` :
          ` Starting verdict: ${baseline}. Every permitted one-reading movement remains a strict ${baseline} win throughout the target interval.`;
      }
      if (result.atlas) $("report-intro").textContent +=
        " Exact region strips were rederived from mean and median squared errors. Below and above each linear tie target, the listed winners hold throughout the open reading strip. Vertical tie columns apply to every target.";
      if (result.targetHorizon) {
        const h = result.targetHorizon;
        $("report-intro").textContent += h.allTargetTie ?
          ` Every real target ties when reading ${h.allTargetTie.index + 1} moves to ${h.allTargetTie.reading}; there is no strict global target guarantee. The computed finite midpoint span is [${h.low}, ${h.high}].` :
          ` Exact global target horizon [${h.low}, ${h.high}]: strict ${h.below} below it, strict ${h.above} above it, and a tie is attainable at every target inside it, including the endpoints.`;
        $("report-intro").textContent += h.probe.witness ?
          ` At probe target ${h.probe.target}, move reading ${h.probe.witness.index + 1} to ${h.probe.witness.reading} for a tie.` :
          ` Probe target ${h.probe.target} has strict ${h.probe.verdict} throughout every permitted route.`;
      }
      $("fingerprint").textContent = hash;
      const cards = record.claim.routes.map(route => {
        const card = node("article", "", "route");
        card.append(node("h3", `Reading ${route.index + 1}: ${record.inputs.readings[route.index]}`));
        const pills = node("div", "", "pills");
        route.reachable.forEach(name => pills.append(node("span", name, `pill ${name.toLowerCase()}`)));
        card.append(pills);
        card.append(node("p", `${route.knots.length} complete knots · ${route.guarantee ? `strict ${route.guarantee} guarantee` : "no strict route guarantee"}`));
        if (route.gap) card.append(node("p", `Exact D range [${route.gap.min.value}, ${route.gap.max.value}]. Minimum at x=${route.gap.min.reading}, t=${route.gap.min.target}; maximum at x=${route.gap.max.reading}, t=${route.gap.max.target}.`));
        if (route.stability) card.append(node("p", route.stability.baseline ?
          `Starting verdict: ${route.stability.baseline}. Left threshold ${route.stability.left.limit} (${route.stability.left.included ? "strict through the bound" : `tie at t=${route.stability.left.witness.target}`}); right threshold ${route.stability.right.limit} (${route.stability.right.included ? "strict through the bound" : `tie at t=${route.stability.right.witness.target}`}).` :
          `No strict winner across all targets at this original reading; tie at t=${route.stability.left.witness.target}. Stability distance is zero.`));
        if (route.region) {
          const detail = node("details", "");
          detail.append(node("summary", "Exact region rules"));
          const strips = node("ol", "");
          for (const stripe of route.region.stripes) strips.append(node("li",
            `Reading (${stripe.from}, ${stripe.to}): tie target ${stripe.tieFrom} to ${stripe.tieTo}; below: ${stripe.below}, above: ${stripe.above}. At target ${record.inputs.target.low}: ${stripe.atTargetLow}; at ${record.inputs.target.high}: ${stripe.atTargetHigh}.`));
          detail.append(strips);
          if (route.region.verticalTies.length) detail.append(node("p",
            `Every target ties at reading ${route.region.verticalTies.join(", ")}.`));
          card.append(detail);
        }
        if (route.targetHorizon) card.append(node("p",
          `Tie-target endpoints: ${route.targetHorizon.atMovementLow} to ${route.targetHorizon.atMovementHigh}. ${route.targetHorizon.allTargetTie === null ?
            "No all-target tie on this route." : `Every target ties at reading ${route.targetHorizon.allTargetTie}.`}`));
        const list = node("ul", "");
        route.reachable.forEach(name => {
          const witness = route.witnesses[name];
          list.append(node("li", `${name} witness: reading ${witness.reading}, target ${witness.target}`));
        });
        card.append(list);
        return card;
      });
      $("routes").replaceChildren(...cards);
      $("report").hidden = false;
    } catch (error) {
      if (started !== revision) return;
      $("seal-status").textContent = "Verification failed";
      $("seal-note").textContent = "No mathematical result was accepted from this record.";
      $("status").textContent = error.message;
      $("status").classList.add("error");
    }
  }
  $("verify-button").addEventListener("click", inspect);
  $("save-to-archive").addEventListener("click", async () => {
    if (!lastValid) return;
    const started = revision, {source, hash} = lastValid;
    $("save-to-archive").disabled = true;
    $("save-status").classList.remove("error");
    $("save-status").textContent = "Rechecking and saving on this device...";
    let db;
    try {
      db = await archive.open();
      const saved = await archive.add(db, source, $("archive-label").value, checker, crypto);
      if (saved.digest !== hash) throw new Error("Fingerprint changed during saving");
      if (started === revision) $("save-status").textContent = saved.created ?
        "Saved locally. Open the archive to search, recheck, and export it." :
        "This exact certificate is already in the local archive.";
    } catch (error) {
      if (started === revision) {
        $("save-status").textContent = `Could not save locally: ${error.message}`;
        $("save-status").classList.add("error");
      }
    } finally {
      if (db) db.close();
      if (started === revision) $("save-to-archive").disabled = false;
    }
  });
  $("print").addEventListener("click", () => window.print());
})();
