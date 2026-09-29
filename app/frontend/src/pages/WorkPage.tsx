import { Github } from "lucide-react";
import { useState } from "react";
import { LinkOrPlaceholder } from "../components/LinkOrPlaceholder";
import { PageIntro } from "../components/PageIntro";
import { ProjectCard } from "../components/ProjectCard";
import { projects } from "../content/projects";
import { githubContent, siteContent } from "../content/site";

const filters = ["All", "Application", "Analytics", "Operations", "AI"] as const;
type Filter = (typeof filters)[number];

export function WorkPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const visibleProjects = filter === "All" ? projects : projects.filter((project) => project.category === filter);

  return (
    <>
      <PageIntro
        eyebrow="Work"
        title="Tools shaped around real decisions"
        description="These projects connect workflow design, data structure, and application engineering. They remain clearly marked as prototypes until their working demos are complete."
      />
      <section className="section content-width work-section" aria-label="Project collection">
        <div className="filter-bar" aria-label="Filter projects">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? "filter-button is-active" : "filter-button"}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {visibleProjects.length > 0 ? (
          <div className="project-grid work-grid">
            {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        ) : (
          <p className="empty-state">No AI-specific project is published yet. Ask Branden will appear here when its evaluated retrieval workflow is ready.</p>
        )}
      </section>
      <section className="section section-muted" aria-labelledby="public-code-heading">
        <div className="content-width public-code-panel">
          <Github aria-hidden="true" />
          <div>
            <p className="eyebrow">Public code</p>
            <h2 id="public-code-heading">{githubContent.title}</h2>
            <p>{githubContent.description}</p>
            <p>{githubContent.availability}</p>
          </div>
          <div className="public-code-actions">
            <LinkOrPlaceholder link={siteContent.links.portfolioRepository} variant="button" />
            <LinkOrPlaceholder link={siteContent.links.github} />
          </div>
        </div>
      </section>
    </>
  );
}
