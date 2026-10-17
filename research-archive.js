(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const archive = globalThis.InwardResearchArchive;
  const checkers = {targetBox: globalThis.InwardTargetBoxVerifier,
    conditionalClaim: globalThis.InwardConditionalClaimVerifier,
    sampleReversal: globalThis.InwardOddFlipVerifier,
    strictJson: globalThis.TargetLensVerifier?.parseReceipt};
  let db = null, entries = [];
  function node(tag, content, className) {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function status(message, error = false) {
    $("status").textContent = message;
    $("status").classList.toggle("error", error);
  }
  function matches(entry) {
    const term = $("archive-search").value.trim().toLocaleLowerCase();
    const filter = $("archive-filter").value;
    if (!entry.valid) return filter === "all" && (!term || String(entry.digest).includes(term));
    const {record, result, label, digest} = entry;
    if (entry.kind === "conditional-claim") {
      const witness = result.classification?.counterexample || result.counterexample;
      const searchable = [label, digest, record.domain.readingCount || 5, record.claim.statement, record.claim.condition,
        record.claim.prediction, result.status, result.classification?.status, ...record.domain.readingValues,
        ...record.domain.targetValues, ...(witness?.readings || []), witness?.target,
        witness?.mean, witness?.median, result.formal?.declaration].join(" ").toLocaleLowerCase();
      return (filter === "all" || filter === "conditional-claim" || filter === result.status ||
        filter === result.classification?.status) &&
        (!term || searchable.includes(term));
    }
    if (entry.kind === "sample-reversal") {
      const bounds = record.inputs.bounds || {low: "0", high: "100"};
      const searchable = [label, digest, record.format, record.inputs.readings.length,
        ...record.inputs.readings, record.inputs.target, bounds.low, bounds.high,
        result.kind, result.baseline, result.best?.threshold, result.best?.distance,
        result.best?.witness, ...record.claim.routes.flatMap(route =>
          [route.threshold, route.distance, route.witness, ...route.knots])]
        .join(" ").toLocaleLowerCase();
      const qualifies = filter === "all" || filter === "sample-reversal" ||
        filter === result.kind || filter === "strict-reversal" && Boolean(result.best);
      return qualifies && (!term || searchable.includes(term));
    }
    const witnessValues = record.claim.routes.flatMap(route =>
      route.reachable.flatMap(name => [route.witnesses[name].reading, route.witnesses[name].target]));
    const searchable = [label, digest, ...record.inputs.readings,
      record.inputs.movement.low, record.inputs.movement.high,
      record.inputs.target.low, record.inputs.target.high, ...result.reachable,
      ...witnessValues, result.stability?.baseline,
      result.stability?.nearestFailure?.distance,
      result.stability?.nearestFailure?.reading,
      result.stability?.nearestFailure?.target,
      ...record.claim.routes.flatMap(route => route.stability ?
        [route.stability.left.limit, route.stability.right.limit] : [])]
      .join(" ").toLocaleLowerCase();
    const qualifies = filter === "all" || filter === "target-box" || filter === "strict" &&
      record.claim.routes.some(route => route.guarantee) || result.reachable.includes(filter);
    return qualifies && (!term || searchable.includes(term));
  }
  function downloadJson(source, filename) {
    const url = URL.createObjectURL(new Blob([source], {type: "application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function download(entry) {
    downloadJson(entry.source,
      `inward-${entry.kind}-${entry.digest.slice(0, 12)}.json`);
  }
  async function discard(entry) {
    if (!window.confirm("Remove this device's local copy? Export its JSON first if you need a backup.")) return;
    try {
      await archive.remove(db, entry.digest);
      await refresh();
      status("Local copy removed. Previously exported files are unaffected.");
    } catch (error) { status(error.message, true); }
  }
  function card(entry) {
    const item = node("details", "", "card");
    item.dataset.valid = String(entry.valid);
    const summary = node("summary", "");
    summary.append(node("small", entry.valid ?
      `${entry.kind === "conditional-claim" ? "Conditional claim" :
        entry.kind === "sample-reversal" ? "Sample reversal" : "Target Box"} · independently rechecked` :
      "Stored item needs attention"));
    summary.append(node("h3", entry.valid ? entry.label : "Record cannot be verified"));
    const claimStatus = {"proved-by-algebra": "General algebraic proof",
      "counterexample-found": "Counterexample found",
      "unrefuted-on-finite-grid": "Unrefuted on finite grid"};
    const badge = entry.valid ? entry.kind === "conditional-claim" ?
      entry.result.classification?.counterexample ? "Universal claim refuted" :
        claimStatus[entry.result.status] : entry.kind === "sample-reversal" ?
          entry.result.kind === "baseline-tie" ? "Starting tie" :
            entry.result.best ? "Strict reversal found" : "No one-reading reversal" :
          entry.result.reachable.join(" · ") : "Not verified";
    summary.append(node("span", badge, entry.valid ? "badge" : "badge warning"));
    item.append(summary);
    const body = node("div", "", "card-body");
    if (entry.valid) {
      const {record, result} = entry;
      if (entry.kind === "conditional-claim") {
        body.append(node("p", record.claim.statement));
        body.append(node("p", `${result.casesChecked} eligible exact cases checked across ${result.readingMultisets} ${result.readingCount}-reading multisets. Reading grid: ${record.domain.readingValues.join(", ")}; target grid: ${record.domain.targetValues.join(", ")}.`));
        if (result.proof) {
          body.append(node("p",
            "General result under the stated target condition: this record was independently replayed. A separate Lean proof checks the corresponding real-number inequality, not these JSON bytes or source measurements. This is established mathematics."));
          if (result.formal) {
            body.append(node("p", `Checked theorem mapping: ${result.formal.declaration} · source revision ${result.formal.sourceCommit.slice(0, 12)}.`));
            const source = node("a", "Read the pinned Lean source ↗");
            source.href = `https://github.com/aruintelligence/inward-mathematics-simulator/blob/${result.formal.sourceCommit}/formal/InwardFormal.lean`;
            body.append(source);
          } else body.append(node("p", "Legacy v1 receipt: no machine-readable theorem binding."));
        }
        else if (result.classification?.counterexample || result.counterexample) {
          const point = result.classification?.counterexample || result.counterexample;
          body.append(node("p", `${result.classification?.construction ? "Constructed endpoint counterexample" : result.classification ? "Fixed-basis universal counterexample" : "Exact counterexample"}: readings ${point.readings.join(", ")}; target ${point.target}; mean ${point.mean}; median ${point.median}. ${point.actualWinner} is closer. ${result.counterexample ? "The selected grid also found a counterexample." : "The selected grid found none."}`));
        } else body.append(node("p", "No counterexample on this finite grid. This does not prove a general claim."));
      } else if (entry.kind === "sample-reversal") {
        const bounds = record.inputs.bounds || {low: "0", high: "100"};
        body.append(node("p", `${record.inputs.readings.length} exact readings · target ${record.inputs.target} · movement [${bounds.low}, ${bounds.high}]. Starting verdict: ${result.baseline}.`));
        body.append(node("p", result.kind === "baseline-tie" ?
          "The original mean and median tie; no strict starting winner can reverse." :
          result.best ? `Closest route: move reading ${result.best.index + 1} to ${result.best.threshold}. The infimum distance is ${result.best.distance}; ${result.best.witness} witnesses the strict opposing winner.` :
            "No single reading can reverse the strict starting winner inside these bounds."));
        body.append(node("p", `${result.routes} routes independently rechecked with exact fractions. A tie threshold is usually not an attained smallest strict move. The inputs are stipulated, not authenticated measurements.`));
      } else {
        body.append(node("p", `${record.inputs.readings.length} readings · ${record.inputs.readings.length % 2 ? "middle-reading" : "central-pair average"} median · movement [${record.inputs.movement.low}, ${record.inputs.movement.high}] · target [${record.inputs.target.low}, ${record.inputs.target.high}]`));
        if (result.gap) body.append(node("p", `Exact attained squared-error gap D spans [${result.gap.min.value}, ${result.gap.max.value}] across all one-reading routes. Minimum at reading ${result.gap.min.index + 1}, x=${result.gap.min.reading}, t=${result.gap.min.target}; maximum at reading ${result.gap.max.index + 1}, x=${result.gap.max.reading}, t=${result.gap.max.target}. Negative favors Mean; positive favors Median.`));
        if (result.stability) {
          const point = result.stability.nearestFailure;
          body.append(node("p", point ?
            `Starting verdict across the target interval: ${result.stability.baseline || "no strict winner"}. First tie after movement ${point.distance} on reading ${point.index + 1} (${point.side}), at x=${point.reading}, t=${point.target}. The tie boundary is excluded from the strict safe region.` :
            `Starting verdict: ${result.stability.baseline}. Every permitted one-reading movement remains strictly ${result.stability.baseline} across the target interval.`));
        }
        body.append(node("p", result.guarantee ? `Strict global guarantee: ${result.guarantee}` :
          "No strict global guarantee under these exact inputs."));
        const strict = record.claim.routes.filter(route => route.guarantee).length;
        body.append(node("p", `${strict} of ${result.routes} routes have a strict guarantee.`));
        const routes = node("ol", "", "route-list");
        record.claim.routes.forEach(route => {
          const witnesses = route.reachable.map(name =>
            `${name} at x=${route.witnesses[name].reading}, t=${route.witnesses[name].target}`).join("; ");
          routes.append(node("li",
            `Reading ${route.index + 1}: ${record.inputs.readings[route.index]} · ${route.reachable.join(" / ")} · ${route.guarantee ? `strict ${route.guarantee}` : "varies or ties"}. Witnesses: ${witnesses}.` +
            (route.stability ? route.stability.baseline ?
              ` Baseline safe region: ${route.stability.left.limit} (${route.stability.left.included ? "included" : "tie boundary"}) to ${route.stability.right.limit} (${route.stability.right.included ? "included" : "tie boundary"}).` :
              ` No strict baseline across targets; tie at original reading with target ${route.stability.left.witness.target}.` : "")));
        });
        body.append(routes);
      }
    } else {
      body.append(node("p", `This local item was not accepted: ${entry.error}. Its mathematical claims are hidden.`));
    }
    body.append(node("small", "SHA-256 of original JSON bytes:"));
    body.append(node("code", String(entry.digest)));
    const actions = node("div", "", "actions");
    if (entry.valid) {
      const exportButton = node("button", "Download exact JSON");
      exportButton.type = "button";
      exportButton.addEventListener("click", () => download(entry));
      actions.append(exportButton);
    }
    const removeButton = node("button", "Remove local copy", "remove");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => discard(entry));
    actions.append(removeButton);
    body.append(actions);
    item.append(body);
    return item;
  }
  function render() {
    const shown = entries.filter(matches);
    $("archive-cards").replaceChildren(...shown.map(card));
    $("archive-empty").hidden = shown.length !== 0;
    $("archive-count").textContent = `Showing ${shown.length} of ${entries.length} local records`;
    const verified = entries.filter(item => item.valid).length;
    $("verified-count").textContent = String(verified);
    $("count-note").textContent = entries.length === verified ?
      `${verified} record${verified === 1 ? "" : "s"} checked under the supplied inputs.` :
      `${entries.length - verified} stored item${entries.length - verified === 1 ? "" : "s"} could not be verified.`;
  }
  async function refresh() {
    entries = await archive.list(db, checkers, crypto);
    render();
  }
  $("archive-search").addEventListener("input", render);
  $("archive-filter").addEventListener("change", render);
  $("refresh-button").addEventListener("click", async () => {
    if (!db) return;
    try { await refresh(); status("Every stored record was rechecked on this visit."); }
    catch (error) { status(error.message, true); }
  });
  $("export-collection").addEventListener("click", async () => {
    if (!db) return;
    $("export-collection").disabled = true;
    $("collection-status").textContent = "Rechecking every stored record before collection export...";
    try {
      const bundle = await archive.exportCollection(db, checkers, crypto);
      downloadJson(bundle.source, `${bundle.format || "inward-research-collection-v1"}.json`);
      $("collection-status").textContent = `Exported ${bundle.count} independently checked records. Keep the JSON as a portable backup.`;
    } catch (error) { $("collection-status").textContent = `Collection not exported: ${error.message}`; }
    finally { $("export-collection").disabled = false; }
  });
  $("import-button").addEventListener("click", async () => {
    if (!db) return;
    const file = $("certificate-file").files[0];
    if (!file) { status("Choose a research record or collection JSON file first.", true); return; }
    $("import-button").disabled = true;
    status("Independently checking the full record...");
    try {
      if (file.size > archive.MAX_COLLECTION_BYTES) throw new Error("File exceeds the 10 MB collection limit");
      const source = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true})
        .decode(await file.arrayBuffer());
      const isCollection = ["inward-research-collection-v1", "inward-research-collection-v2"]
        .includes(JSON.parse(source)?.format);
      const saved = isCollection ? await archive.importCollection(db, source, checkers, crypto) :
        await archive.add(db, source, $("certificate-label").value, checkers, crypto);
      await refresh();
      status(isCollection ? `Collection checked: ${saved.created} imported, ${saved.duplicates} already here.` :
        saved.created ? `Checked and saved: ${saved.digest}` :
          `Already in this local archive: ${saved.digest}`);
      if (isCollection || saved.created) {
        $("certificate-file").value = ""; $("certificate-label").value = "";
      }
    } catch (error) { status(`Not saved: ${error.message}`, true); }
    finally { $("import-button").disabled = false; }
  });
  archive.open().then(database => {
    db = database;
    $("export-collection").disabled = false;
    return refresh();
  }).then(() => status("Archive ready. Each visible result was checked again."))
    .catch(error => {
      $("import-button").disabled = true;
      status(`Local archive unavailable: ${error.message}`, true);
      $("verified-count").textContent = "—";
      $("count-note").textContent = "You can still download JSON from the research labs.";
    });
})();
