(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const checker = globalThis.InwardTargetBoxVerifier;
  let file = null;
  let revision = 0;
  function node(tag, content, className) {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
  }
  function reset(message) {
    revision++;
    $("report").hidden = true;
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
      $("seal-status").textContent = "Mathematics verified";
      $("seal-note").textContent = `${result.routes} exhaustive routes checked with exact rational arithmetic.`;
      $("status").textContent = "Certificate accepted under its stated inputs.";
      $("reachable").textContent = result.reachable.join(" · ");
      $("overall-note").textContent = `${result.routes} readings; movement [${record.inputs.movement.low}, ${record.inputs.movement.high}]; target [${record.inputs.target.low}, ${record.inputs.target.high}].`;
      $("guarantee").textContent = result.guarantee || "None across all routes";
      $("guarantee-note").textContent = result.guarantee ?
        `The ${result.guarantee.toLowerCase()} is strictly closer for every permitted reading move and target in this model.` :
        "A strict winner does not hold across every route and target in this model.";
      $("report-intro").textContent = "Recomputed the complete root partition and possible outcomes for each route; checked every supplied witness by comparing exact squared errors.";
      $("fingerprint").textContent = hash;
      const cards = record.claim.routes.map(route => {
        const card = node("article", "", "route");
        card.append(node("h3", `Reading ${route.index + 1}: ${record.inputs.readings[route.index]}`));
        const pills = node("div", "", "pills");
        route.reachable.forEach(name => pills.append(node("span", name, `pill ${name.toLowerCase()}`)));
        card.append(pills);
        card.append(node("p", `${route.knots.length} complete knots · ${route.guarantee ? `strict ${route.guarantee} guarantee` : "no strict route guarantee"}`));
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
  $("print").addEventListener("click", () => window.print());
})();
