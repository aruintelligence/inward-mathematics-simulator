(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const archive = globalThis.InwardResearchArchive;
  const checker = globalThis.InwardTargetBoxVerifier;
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
    const witnessValues = record.claim.routes.flatMap(route =>
      route.reachable.flatMap(name => [route.witnesses[name].reading, route.witnesses[name].target]));
    const searchable = [label, digest, ...record.inputs.readings,
      record.inputs.movement.low, record.inputs.movement.high,
      record.inputs.target.low, record.inputs.target.high, ...result.reachable,
      ...witnessValues].join(" ").toLocaleLowerCase();
    const qualifies = filter === "all" || filter === "strict" &&
      record.claim.routes.some(route => route.guarantee) || result.reachable.includes(filter);
    return qualifies && (!term || searchable.includes(term));
  }
  function download(entry) {
    const url = URL.createObjectURL(new Blob([entry.source], {type: "application/json"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `inward-target-box-${entry.digest.slice(0, 12)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    summary.append(node("small", entry.valid ? "Independently rechecked" : "Stored item needs attention"));
    summary.append(node("h3", entry.valid ? entry.label : "Record cannot be verified"));
    summary.append(node("span", entry.valid ? entry.result.reachable.join(" · ") : "Not verified",
      entry.valid ? "badge" : "badge warning"));
    item.append(summary);
    const body = node("div", "", "card-body");
    if (entry.valid) {
      const {record, result} = entry;
      body.append(node("p", `${record.inputs.readings.length} readings · movement [${record.inputs.movement.low}, ${record.inputs.movement.high}] · target [${record.inputs.target.low}, ${record.inputs.target.high}]`));
      body.append(node("p", result.guarantee ? `Strict global guarantee: ${result.guarantee}` :
        "No strict global guarantee under these exact inputs."));
      const strict = record.claim.routes.filter(route => route.guarantee).length;
      body.append(node("p", `${strict} of ${result.routes} routes have a strict guarantee.`));
      const routes = node("ol", "", "route-list");
      record.claim.routes.forEach(route => {
        const witnesses = route.reachable.map(name =>
          `${name} at x=${route.witnesses[name].reading}, t=${route.witnesses[name].target}`).join("; ");
        routes.append(node("li",
          `Reading ${route.index + 1}: ${record.inputs.readings[route.index]} · ${route.reachable.join(" / ")} · ${route.guarantee ? `strict ${route.guarantee}` : "varies or ties"}. Witnesses: ${witnesses}.`));
      });
      body.append(routes);
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
      `${verified} certificate${verified === 1 ? "" : "s"} checked under the supplied inputs.` :
      `${entries.length - verified} stored item${entries.length - verified === 1 ? "" : "s"} could not be verified.`;
  }
  async function refresh() {
    entries = await archive.list(db, checker, crypto);
    render();
  }
  $("archive-search").addEventListener("input", render);
  $("archive-filter").addEventListener("change", render);
  $("refresh-button").addEventListener("click", async () => {
    if (!db) return;
    try { await refresh(); status("Every stored certificate was rechecked on this visit."); }
    catch (error) { status(error.message, true); }
  });
  $("import-button").addEventListener("click", async () => {
    if (!db) return;
    const file = $("certificate-file").files[0];
    if (!file) { status("Choose a Target Box JSON certificate first.", true); return; }
    $("import-button").disabled = true;
    status("Independently checking every route and witness...");
    try {
      if (file.size > 2_000_000) throw new Error("Certificate exceeds the 2 MB limit");
      const source = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true})
        .decode(await file.arrayBuffer());
      const saved = await archive.add(db, source, $("certificate-label").value, checker, crypto);
      await refresh();
      status(saved.created ? `Checked and saved: ${saved.digest}` :
        `Already in this local archive: ${saved.digest}`);
      if (saved.created) { $("certificate-file").value = ""; $("certificate-label").value = ""; }
    } catch (error) { status(`Not saved: ${error.message}`, true); }
    finally { $("import-button").disabled = false; }
  });
  archive.open().then(database => {
    db = database;
    return refresh();
  }).then(() => status("Archive ready. Each visible result was checked again."))
    .catch(error => {
      $("import-button").disabled = true;
      status(`Local archive unavailable: ${error.message}`, true);
      $("verified-count").textContent = "—";
      $("count-note").textContent = "You can still download certificates from Target Box.";
    });
})();
