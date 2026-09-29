import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectSummary } from "@portfolio/shared";

interface ProjectCardProps {
  project: ProjectSummary;
  showOutlineLink?: boolean;
}

export function ProjectCard({ project, showOutlineLink = true }: ProjectCardProps) {
  return (
    <article className={`project-card accent-${project.accent}`} id={project.id}>
      <div className="project-meta">
        <span>{project.category}</span>
        <span className="status-label">{project.status}</span>
      </div>
      <h3>{project.title}</h3>
      <p>{project.description}</p>
      <dl className="project-details">
        <div>
          <dt>Problem</dt>
          <dd>{project.problem}</dd>
        </div>
        <div>
          <dt>My role</dt>
          <dd>{project.role}</dd>
        </div>
      </dl>
      <ul className="technology-list" aria-label="Technologies">
        {project.technologies.map((technology) => <li key={technology}>{technology}</li>)}
      </ul>
      {showOutlineLink ? (
        <Link className="project-link" to={`/work#${project.id}`}>
          View project outline <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      ) : null}
    </article>
  );
}
