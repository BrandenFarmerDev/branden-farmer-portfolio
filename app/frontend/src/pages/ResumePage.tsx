import { Download, Mail, MapPin, Phone } from "lucide-react";
import profilePhoto from "../assets/profile-photo.webp";
import { PageIntro } from "../components/PageIntro";
import { resumeContent, type ResumeDetail } from "../content/resume";
import { siteContent } from "../content/site";

interface DetailListProps {
  items: readonly ResumeDetail[];
}

function DetailList({ items }: DetailListProps) {
  return (
    <div className="resume-detail-list">
      {items.map((item) => (
        <article key={`${item.title}-${item.date}`}>
          <div>
            <h3>{item.title}</h3>
            {item.organization ? <p>{item.organization}</p> : null}
            {item.note ? <p className="resume-detail-note">{item.note}</p> : null}
          </div>
          {item.date ? <span>{item.date}</span> : null}
        </article>
      ))}
    </div>
  );
}

export function ResumePage() {
  return (
    <>
      <PageIntro
        eyebrow="Résumé"
        title="Experience across operations, data, and development"
        description={resumeContent.summary}
      />

      <section className="section content-width resume-page-layout" aria-label="Digital résumé">
        <aside className="resume-sidebar">
          <div className="resume-portrait-frame">
            <img
              src={profilePhoto}
              alt="Portrait of Branden Farmer"
              width="900"
              height="900"
            />
          </div>
          <div className="resume-download-card">
            <Download aria-hidden="true" />
            <p className="eyebrow">Take a copy</p>
            <h2>Download the résumé</h2>
            <p>The original two-page PDF is available for applications and interview review.</p>
            <a
              className="button button-primary"
              href={siteContent.links.resume.href}
              download="Branden_Farmer_Resume.pdf"
            >
              Download PDF <Download aria-hidden="true" size={17} />
            </a>
          </div>
        </aside>

        <article className="digital-resume">
          <header className="resume-document-header">
            <p className="eyebrow">Digital résumé</p>
            <h2>{siteContent.name}</h2>
            <p className="resume-headline">{resumeContent.headline}</p>
            <address className="resume-contact-list">
              <span><MapPin aria-hidden="true" />{resumeContent.location}</span>
              <a href={resumeContent.emailHref}><Mail aria-hidden="true" />{resumeContent.email}</a>
              <a href={resumeContent.phoneHref}><Phone aria-hidden="true" />{resumeContent.phone}</a>
            </address>
          </header>

          <section className="resume-section" aria-labelledby="resume-summary-heading">
            <p className="eyebrow">Professional summary</p>
            <h2 id="resume-summary-heading">Systems thinking grounded in operations</h2>
            <p className="resume-summary">{resumeContent.summary}</p>
          </section>

          <section className="resume-section" aria-labelledby="resume-experience-heading">
            <p className="eyebrow">Career history</p>
            <h2 id="resume-experience-heading">Professional experience</h2>
            <div className="resume-experience-list">
              {resumeContent.experience.map((employer) => (
                <section className="resume-employer" key={employer.name}>
                  <header>
                    <h3>{employer.name}</h3>
                    <span>{employer.location}</span>
                  </header>
                  {employer.roles.map((role) => (
                    <article className="resume-role" key={`${role.title}-${role.dates}`}>
                      <div className="resume-role-heading">
                        <h4>{role.title}</h4>
                        <span>{role.dates}</span>
                      </div>
                      <ul>
                        {role.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                      </ul>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </section>

          <section className="resume-section" aria-labelledby="resume-skills-heading">
            <p className="eyebrow">Technical toolkit</p>
            <h2 id="resume-skills-heading">Technical skills</h2>
            <dl className="resume-skill-groups">
              {resumeContent.skillGroups.map((group) => (
                <div key={group.title}>
                  <dt>{group.title}</dt>
                  <dd>{group.skills}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="resume-section" aria-labelledby="resume-projects-heading">
            <p className="eyebrow">Applied work</p>
            <h2 id="resume-projects-heading">Selected technical projects</h2>
            <div className="resume-project-list">
              {resumeContent.selectedProjects.map((project) => (
                <article key={project.title}>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="resume-section-grid">
            <section className="resume-section" aria-labelledby="resume-education-heading">
              <p className="eyebrow">Learning</p>
              <h2 id="resume-education-heading">Education</h2>
              <DetailList items={resumeContent.education} />
            </section>
            <section className="resume-section" aria-labelledby="resume-training-heading">
              <p className="eyebrow">Professional development</p>
              <h2 id="resume-training-heading">Training and certifications</h2>
              <DetailList items={resumeContent.training} />
            </section>
          </div>

          <section className="resume-section resume-recognition" aria-labelledby="resume-recognition-heading">
            <p className="eyebrow">Recognition</p>
            <h2 id="resume-recognition-heading">Awards and recognition</h2>
            <ul>
              {resumeContent.recognition.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </article>
      </section>
    </>
  );
}
