"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck, Sparkles, Upload, X } from "lucide-react";

export default function HomePage() {
  const [answerInput, setAnswerInput] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceDragging, setSourceDragging] = useState(false);
  const [notice, setNotice] = useState("");

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const handleSourceFile = async (file?: File) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "txt") {
      notify("Choose a PDF or plain text file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify("This file is over the 10 MB limit.");
      return;
    }
    setSourceName(file.name);
    if (extension === "txt") {
      try {
        const text = await file.text();
        if (!text.trim()) {
          setSourceText("");
          notify("This text file is empty.");
          return;
        }
        setSourceText(text);
      } catch {
        setSourceText("");
        notify("Couldn’t read this text file. Try pasting its contents instead.");
      }
      return;
    }
    setSourceText("");
    notify("PDF text extraction isn’t connected. Paste source text below.");
  };

  const startAudit = () => {
    if (!answerInput.trim() || !sourceText.trim()) return;
    notify("Auditing isn’t connected yet.");
  };

  return <main className="app-shell" data-page-route="/">
    <header className="topbar home-topbar">
      <div className="home-brand"><Sparkles size={17}/><span>SECOND OPINION</span><i>/</i><small>NEW AUDIT</small></div>
      <span className="home-topbar-note">Evidence stays tied to your sources</span>
    </header>
    <section className="welcome-page">
      <div className="welcome-kicker"><ShieldCheck size={15}/> SOURCE-GROUNDED ANSWER REVIEW</div>
      <h1>Know what your answers<br/>are built on.</h1>
      <p>Check an AI answer against your documents. Review each claim, follow the evidence, and share a clear report.</p>
      <div className="welcome-card">
        <label className="answer-field-label" htmlFor="answer-input">AI-generated answer</label>
        <textarea id="answer-input" maxLength={15000} value={answerInput} onChange={(event) => setAnswerInput(event.target.value)} placeholder="Paste the answer you want to check…"/>
        <div className="welcome-card-bottom"><span aria-live="polite">{answerInput.length.toLocaleString()} / 15,000 characters</span></div>
      </div>
      <div className="welcome-card source-entry">
        <label className="answer-field-label">Source documents</label>
        <label className={`dropzone ${sourceDragging ? "is-dragging" : ""}`} htmlFor="source-file"
          onDragOver={(event) => { event.preventDefault(); setSourceDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSourceDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setSourceDragging(false); void handleSourceFile(event.dataTransfer.files?.[0]); }}>
          <Upload size={19}/>
          <span>{sourceName || "Drop PDF or TXT files here, or browse"}</span>
          <small>{sourceName ? sourceName.toLowerCase().endsWith(".pdf") ? "PDF selected · paste its text below" : "Text file loaded · Choose another file to replace it" : "PDF or plain text · Up to 10 MB"}</small>
          <input id="source-file" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(event) => { void handleSourceFile(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        </label>
        {sourceName && <button type="button" className="file-remove" onClick={() => { setSourceName(""); setSourceText(""); }} aria-label="Remove selected source"><X size={13}/> Remove source</button>}
        <label className="paste-source-label" htmlFor="source-text">Or paste source text</label>
        <textarea id="source-text" maxLength={200000} className="source-textarea" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste relevant source text here…"/>
        <div className="source-length-feedback" aria-live="polite">{sourceText.length.toLocaleString()} / 200,000 characters</div>
      </div>
      <div className="welcome-actions">
        <button className="primary-button" disabled={!answerInput.trim() || !sourceText.trim()} onClick={startAudit}>Audit answer <ArrowRight size={16}/></button>
        <span>{!answerInput.trim() ? "Add an answer to continue." : !sourceText.trim() ? "Add a source to continue." : "Auditing is not connected yet."}</span>
      </div>
    </section>
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
