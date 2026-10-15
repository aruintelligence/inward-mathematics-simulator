(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const verifier = globalThis.InwardOddFlipVerifier;
  const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
  let file = null;
  let revision = 0;
  function reset(message) {
    revision++;
    $("report").hidden = true;
    $("seal-status").textContent = "Awaiting certificate";
    $("seal-note").textContent = "Choose a JSON certificate or paste its contents below.";
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
    let bytes, source;
    try {
      if (file) {
        if (file.size > 2_000_000) throw new Error("Certificate exceeds the 2 MB limit.");
        bytes = new Uint8Array(await file.arrayBuffer());
        source = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
      } else {
        source = $("receipt-json").value;
        if (!source.trim()) throw new Error("Choose a JSON certificate or paste its complete contents.");
        bytes = new TextEncoder().encode(source);
        if (bytes.length > 2_000_000) throw new Error("Certificate exceeds the 2 MB limit.");
      }
      const record = verifier.parseReceipt(source);
      const result = verifier.verify(record);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (started !== revision) return; // A newer file or paste replaced this result.
      const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
      $("seal-status").textContent = "Mathematics verified";
      $("seal-note").textContent = result.kind === "baseline-tie" ?
        "The tied starting verdict was checked under the supplied inputs." :
        `All ${result.routes} routes checked against independent exact calculations.`;
      $("status").textContent = "Certificate accepted. The result below is conditional on its supplied inputs.";
      $("baseline").textContent = result.baseline;
      $("baseline-note").textContent = `${record.inputs.readings.length} readings, target ${record.inputs.target}.`;
      $("best-distance").textContent = result.kind === "baseline-tie" ? "No strict baseline" :
        result.best ? `${result.best.distance} units to tie` : "No one-reading reversal";
      $("best-note").textContent = result.kind === "baseline-tie" ?
        "The original errors tie, so no strict starting winner can be reversed." :
        result.best ? `Reading ${result.best.index + 1} ties at ${result.best.threshold}; ${result.best.witness} strictly reverses the winner.` :
          "No one-reading move in [0,100] makes the opposite estimator strictly closer.";
      $("report-intro").textContent = result.kind === "baseline-tie" ?
        "The input values and tied starting verdict were checked. No strict reversal routes were claimed." :
        `All ${result.routes} exact factor-root partitions, their open-interval winners, tie boundaries, and reversal witnesses were checked.`;
      $("fingerprint").textContent = hash;
      const cards = record.claim.routes.map(route => {
        const article = text("article", ""); article.className = "route";
        article.append(text("b", `Reading ${route.index + 1}: ${record.inputs.readings[route.index]}`));
        if (result.best && result.best.index === route.index) article.append(text("span", "Nearest route"));
        const badge = article.querySelector("span"); if (badge) badge.className = "tag";
        article.append(text("small", route.threshold === null ? "No strict reversal in [0,100]" :
          `${route.distance} to tie at ${route.threshold} · opposing witness ${route.witness}`));
        return article;
      });
      $("routes").replaceChildren(...cards);
      $("report").hidden = false;
    } catch (error) {
      if (started !== revision) return;
      $("seal-status").textContent = "Verification failed";
      $("seal-note").textContent = "The record was not accepted. No mathematical result is certified here.";
      $("status").textContent = error.message;
      $("status").classList.add("error");
    }
  }
  $("verify-button").addEventListener("click", inspect);
  $("print").addEventListener("click", () => window.print());
})();
