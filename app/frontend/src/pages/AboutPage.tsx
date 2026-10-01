import { ArrowRight, CodeXml } from "lucide-react";
import { Link } from "react-router-dom";
import { LinkOrPlaceholder } from "../components/LinkOrPlaceholder";
import { PageIntro } from "../components/PageIntro";
import { ABOUT_OVERVIEW_ID, anchorId, WORKING_PRINCIPLES_ID } from "../content/anchors";
import { careerMilestones, experienceAreas, githubContent, siteContent, workingPrinciples } from "../content/site";
import { useHashTarget } from "../lib/useHashTarget";

export function AboutPage() {
  useHashTarget();

  return (
    <>
      <PageIntro
        eyebrow="About"
        title="Technical depth with an operations point of view"
        description={siteContent.introduction}
      />
      <section className="section content-width split-layout">
        <div className="prose-column" id={ABOUT_OVERVIEW_ID}>
          <p className="eyebrow">Career narrative</p>
          <h2>Connecting systems to the people who rely on them</h2>
          <p>{siteContent.perspective}</p>
          <p>{siteContent.availability}</p>
        </div>
        <div className="principles-list" id={WORKING_PRINCIPLES_ID}>
          <p className="eyebrow">Ways of working</p>
          <ol>
            {workingPrinciples.map((principle, index) => (
              <li key={principle}><span>{String(index + 1).padStart(2, "0")}</span>{principle}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section content-width" aria-labelledby="career-timeline-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Career progression</p>
            <h2 id="career-timeline-heading">From the workbench to connected systems</h2>
          </div>
        </div>
        <ol className="career-timeline">
          {careerMilestones.map((milestone) => (
            <li key={milestone.period} id={anchorId.career(milestone.title)}>
              <span className="timeline-period">{milestone.period}</span>
              <div>
                <h3>{milestone.title}</h3>
                <p className="timeline-roles">{milestone.roles}</p>
                <p>{milestone.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="section section-muted">
        <div className="content-width">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Experience areas</p>
              <h2>One practice, several disciplines</h2>
            </div>
          </div>
          <div className="area-grid">
            {experienceAreas.map((area) => (
              <article key={area.title} id={anchorId.area(area.title)}>
                <h3>{area.title}</h3>
                <p>{area.description}</p>
                <ul className="evidence-list">
                  {area.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section content-width about-closing-grid">
        <article className="github-callout">
          <CodeXml aria-hidden="true" />
          <p className="eyebrow">GitHub</p>
          <h2>{githubContent.title}</h2>
          <p>{githubContent.description}</p>
          <p className="github-availability">{githubContent.availability}</p>
          <div className="action-row">
            <LinkOrPlaceholder link={siteContent.links.github} variant="button" />
            <LinkOrPlaceholder link={siteContent.links.portfolioRepository} variant="button" />
          </div>
        </article>
        <article className="about-next-step">
          <p className="eyebrow">Continue</p>
          <h2>Review the details or start a conversation.</h2>
          <p>The digital résumé carries the complete role history. Contact options include email, LinkedIn, and a recruiter conversation.</p>
          <div className="action-row">
            <Link className="button button-primary" to="/resume">View résumé <ArrowRight aria-hidden="true" size={17} /></Link>
            <Link className="button button-secondary" to="/contact">Contact Branden</Link>
          </div>
        </article>
      </section>
    </>
  );
}
