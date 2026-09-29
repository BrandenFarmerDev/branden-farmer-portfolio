import { ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import profilePhoto from "../assets/profile-photo.webp";
import { ProjectCard } from "../components/ProjectCard";
import { projects } from "../content/projects";
import { siteContent } from "../content/site";

export function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-grid content-width">
          <div className="hero-copy">
            <p className="eyebrow">Product and technical work</p>
            <h1>{siteContent.name}</h1>
            <p className="hero-statement">{siteContent.statement}</p>
            <p className="hero-intro">{siteContent.introduction}</p>
            <div className="action-row">
              <Link className="button button-primary" to="/work">
                Explore the work <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <Link className="button button-secondary" to="/resume">
                View résumé <FileText aria-hidden="true" size={17} />
              </Link>
            </div>
          </div>
          <aside className="profile-rail" aria-label="About Branden Farmer">
            <div className="profile-photo-frame">
              <img
                className="profile-photo"
                src={profilePhoto}
                alt="Portrait of Branden Farmer"
                width="900"
                height="900"
              />
            </div>
            <div className="practice-map" aria-label="Branden's connected areas of practice">
              <span className="practice-label">How I work across systems</span>
              <ol>
                <li><span>01</span> Operations</li>
                <li><span>02</span> Data</li>
                <li><span>03</span> Software</li>
              </ol>
              <p>Understand the work. Structure the information. Build the useful thing.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="section content-width" aria-labelledby="selected-work-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Selected work</p>
            <h2 id="selected-work-heading">Three systems in development</h2>
          </div>
          <Link className="text-link" to="/work">View all work <ArrowRight aria-hidden="true" size={16} /></Link>
        </div>
        <div className="project-grid">
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      </section>

      <section className="statement-band">
        <div className="content-width statement-inner">
          <FileText aria-hidden="true" />
          <div>
            <p className="eyebrow">Working perspective</p>
            <h2>Software has to fit the work around it.</h2>
            <p>{siteContent.perspective}</p>
          </div>
          <Link className="button button-secondary" to="/about">About my approach</Link>
        </div>
      </section>
    </>
  );
}
