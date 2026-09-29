import { BookOpen, Search, ShieldCheck } from "lucide-react";
import { PageIntro } from "../components/PageIntro";

const stages = [
  { icon: BookOpen, title: "Approved sources", text: "Reviewed résumé facts, project case studies, writing, and public repository content." },
  { icon: Search, title: "Evidence retrieval", text: "Relevant passages selected before an answer is generated, with links back to their source sections." },
  { icon: ShieldCheck, title: "Bounded answers", text: "Unsupported qualifications, metrics, and outcomes are called out as gaps rather than inferred." },
];

export function AskPage() {
  return (
    <>
      <PageIntro
        eyebrow="Ask Branden"
        title="Evidence first, assistant later"
        description="The planned assistant will answer questions about Branden's experience and compare a job description with approved portfolio evidence. It is not active in this initial scaffold."
      />
      <section className="section content-width ask-layout">
        <div className="assistant-shell" aria-label="Ask Branden unavailable preview">
          <div className="assistant-heading">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>Assistant not configured</strong>
              <p>No prompt will be sent or stored.</p>
            </div>
          </div>
          <label htmlFor="ask-placeholder">Question</label>
          <textarea id="ask-placeholder" disabled placeholder="Ask about experience, projects, or role alignment" rows={5} />
          <button className="button button-primary" type="button" disabled>Ask Branden</button>
        </div>
        <div className="rag-stages">
          <p className="eyebrow">Planned retrieval flow</p>
          {stages.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <Icon aria-hidden="true" />
              <div><h2>{title}</h2><p>{text}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}