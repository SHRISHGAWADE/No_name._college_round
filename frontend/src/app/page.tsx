"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { ApiError, createAudit, loadMockExample, uploadFiles, uploadPastedSource, waitForBackend } from "@/lib/api";
import { saveAuditSources } from "@/lib/useAudit";

export default function HomePage() {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const addFiles = (incoming: FileList | File[]) => {
    const selected = Array.from(incoming);
    const invalid = selected.find((file) => !/\.(pdf|txt)$/i.test(file.name));
    if (invalid) { setError(`${invalid.name} is not a PDF or TXT file.`); return; }
    const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) { setError(`${oversized.name} is over the 10 MB limit.`); return; }
    if (files.length + selected.length > 5) { setError("Choose no more than five files at once."); return; }
    setFiles((current) => [...current, ...selected]);
    setError("");
  };

  const loadDemo = async () => {
    setError("");
    try {
      const example = await loadMockExample();
      setAnswer(example.answer);
      setSourceText(example.sources.map((source) => source.pages.map((page) => `Page ${page.page}\n${page.text}`).join("\n\n")).join("\n\n"));
      setFiles([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the sample example."); }
  };

  const startAudit = async () => {
    if (!answer.trim() || (!files.length && !sourceText.trim()) || submitting) return;
    setSubmitting(true); setError(""); setProgress("Checking the backend…");
    try {
      await waitForBackend(() => setProgress("Waking up the server…"));
      const sources = [];
      if (files.length) sources.push(...(await uploadFiles(files)).sources);
      if (sourceText.trim()) sources.push(...(await uploadPastedSource("pasted_source.txt", sourceText)).sources);
      if (!sources.length) throw new ApiError("Add at least one source document or paste source text.");
      saveAuditSources(sources);
      setProgress("Starting your audit…");
      const created = await createAudit(answer, sources.map((source) => source.source_id));
      try { sessionStorage.setItem("second-opinion-current-audit", created.audit_id); } catch { /* Navigation still works without session storage. */ }
      window.dispatchEvent(new Event("second-opinion:audit"));
      router.push(`/audit/${encodeURIComponent(created.audit_id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The audit could not be started. Check your connection and try again.");
      setSubmitting(false); setProgress("");
    }
  };

  return <main className="app-shell" data-page-route="/">
    <header className="topbar home-topbar"><div className="home-brand"><Sparkles size={17}/><span>SECOND OPINION</span><i>/</i><small>NEW AUDIT</small></div><span className="home-topbar-note">Evidence stays tied to your sources</span></header>
    <section className="welcome-page">
      <div className="welcome-kicker"><ShieldCheck size={15}/> SOURCE-GROUNDED ANSWER REVIEW</div>
      <h1>Know what your answers<br/>are built on.</h1>
      <p>Check an AI answer against your documents. Review each claim, follow the evidence, and share a clear report.</p>
      <div className="welcome-card"><label htmlFor="answer-input">AI-generated answer</label><textarea id="answer-input" maxLength={20000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Paste the answer you want to check…"/><div className="welcome-card-bottom"><span aria-live="polite">{answer.length.toLocaleString()} / 20,000 characters</span>{process.env.NEXT_PUBLIC_USE_MOCK === "1" && <button type="button" className="text-button" onClick={() => void loadDemo()}><Sparkles size={15}/> Load demo example</button>}</div></div>
      <div className="welcome-card source-entry"><label>Source documents</label><label className="dropzone" htmlFor="source-file" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}><Upload size={19}/><span>{files.length ? files.map((file) => file.name).join(", ") : "Drop PDF or TXT files here, or browse"}</span><small>{files.length ? `${files.length} file${files.length > 1 ? "s" : ""} selected · up to 10 MB each` : "PDF or plain text · Up to 10 MB per file"}</small><input id="source-file" type="file" multiple accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }}/></label>
        {files.length > 0 && <button type="button" className="file-remove" onClick={() => setFiles([])} aria-label="Remove selected files"><X size={13}/> Remove files</button>}
        <label className="paste-source-label" htmlFor="source-text">Or paste source text</label><textarea id="source-text" maxLength={200000} className="source-textarea" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste relevant source text here…"/><div className="source-length-feedback" aria-live="polite">{sourceText.length.toLocaleString()} / 200,000 characters</div></div>
      <div className="welcome-actions"><button className="primary-button" disabled={!answer.trim() || (!files.length && !sourceText.trim()) || submitting} onClick={() => void startAudit()}>{submitting ? progress || "Starting…" : <>Audit answer <ArrowRight size={16}/></>}</button><span>{submitting ? "The first connection may take up to a minute while the server wakes." : !answer.trim() ? "Add an answer to continue." : (!files.length && !sourceText.trim()) ? "Add a source to continue." : "Findings are relative to your uploaded sources."}</span></div>
      {error && <p role="alert" className="home-error">{error}</p>}
    </section>
  </main>;
}
