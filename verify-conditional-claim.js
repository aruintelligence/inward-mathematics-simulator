(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const checker = globalThis.InwardConditionalClaimVerifier;
  const archive = globalThis.InwardResearchArchive;
  let selectedFile = null, revision = 0;
  let verifiedSource = null, verifiedDigest = null;
  function reset(message) {
    revision++;
    verifiedSource = verifiedDigest = null;
    $("save-to-archive").disabled = true;
    $("save-status").textContent = "";
    $("result").hidden = true;
    $("verdict").textContent = "Awaiting record";
    $("verdict-note").textContent = "Choose an exported claim JSON file or paste its full text.";
    $("status").textContent = message;
    $("status").classList.remove("error");
  }
  $("claim-file").addEventListener("change", event => {
    selectedFile = event.target.files[0] || null;
    $("claim-json").value = "";
    $("file-name").textContent = selectedFile ? selectedFile.name : "No file selected";
    reset(selectedFile ? "Ready to check the selected file." : "Choose a claim record.");
  });
  $("claim-json").addEventListener("input", () => {
    selectedFile = null;
    $("claim-file").value = "";
    $("file-name").textContent = "Using pasted JSON";
    reset("Ready to check the pasted record.");
  });
  async function inspect() {
    reset("Replaying every eligible case and checking the algebra...");
    const started = revision;
    try {
      let bytes, source;
      if (selectedFile) {
        if (selectedFile.size > 1_000_000) throw new Error("Claim record exceeds 1 MB.");
        bytes = new Uint8Array(await selectedFile.arrayBuffer());
        source = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
      } else {
        source = $("claim-json").value;
        if (!source.trim()) throw new Error("Choose a claim JSON file or paste the full record.");
        bytes = new TextEncoder().encode(source);
        if (bytes.length > 1_000_000) throw new Error("Claim record exceeds 1 MB.");
      }
      const record = checker.parseClaim(source);
      const checked = checker.verify(record);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (started !== revision) return;
      const fingerprint = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
      $("verdict").textContent = "Mathematics checked";
      $("verdict-note").textContent = "The selected record is internally consistent under its stated model.";
      $("status").textContent = "Independent browser verification complete.";
      $("badge").textContent = checked.status === "proved-by-algebra" ? "General algebraic proof" :
        checked.status === "counterexample-found" ? "Counterexample found" : "Unrefuted on this finite grid";
      $("result").classList.toggle("refuted", checked.status === "counterexample-found");
      $("statement").textContent = checked.statement;
      $("count").textContent = `${checked.casesChecked} eligible exact cases checked across ${checked.readingMultisets} five-reading multisets.`;
      if (checked.proof) {
        $("explanation").textContent = "The general conclusion follows from (a−t)² − (b−t)² = (a−b)(a+b−2t), where a ≤ b are the two estimates. The checker expanded both sides independently and checked that the selected target condition forces the factor signs and claimed error ordering. This is an elementary algebraic argument for all real inputs, not a formal proof-assistant result or a new theorem.";
        $("witness").textContent = "The chosen finite grid illustrates the statement; it is not the source of its general proof.";
      } else if (checked.counterexample) {
        const point = checked.counterexample;
        $("explanation").textContent = "A single exact witness refutes this universal claim in the stated model.";
        $("witness").textContent = `Readings ${point.readings.join(", ")}; target ${point.target}; mean ${point.mean}; median ${point.median}. The ${point.actualWinner} is closer.`;
      } else {
        $("explanation").textContent = "The finite search found no counterexample. It does not establish a theorem or prove the claim for other inputs.";
        $("witness").textContent = checked.casesChecked ? "The chosen grid contained eligible cases." :
          "No chosen grid point met the condition; this record has no eligible finite case.";
      }
      $("fingerprint").textContent = fingerprint;
      verifiedSource = source;
      verifiedDigest = fingerprint;
      $("save-to-archive").disabled = false;
      $("result").hidden = false;
    } catch (error) {
      if (started !== revision) return;
      $("verdict").textContent = "Record rejected";
      $("verdict-note").textContent = "No result was accepted from this record.";
      $("status").textContent = error.message;
      $("status").classList.add("error");
    }
  }
  $("verify-button").addEventListener("click", inspect);
  $("print-report").addEventListener("click", () => window.print());
  $("save-to-archive").addEventListener("click", async () => {
    if (!verifiedSource || !verifiedDigest) return;
    const started = revision, source = verifiedSource, digest = verifiedDigest;
    $("save-to-archive").disabled = true;
    $("save-status").textContent = "Rechecking the original JSON before local storage...";
    let db;
    try {
      db = await archive.open();
      const saved = await archive.add(db, source, $("archive-label").value,
        {conditionalClaim: checker}, crypto);
      if (saved.digest !== digest) throw new Error("Rechecked fingerprint changed");
      if (started === revision) $("save-status").textContent = saved.created ?
        "Checked claim saved locally. Open the archive to search, recheck, and export it." :
        "These exact JSON bytes are already in your local archive.";
    } catch (error) {
      if (started === revision) $("save-status").textContent = `Not saved: ${error.message}`;
    } finally {
      db?.close();
      if (started === revision) $("save-to-archive").disabled = false;
    }
  });
})();
