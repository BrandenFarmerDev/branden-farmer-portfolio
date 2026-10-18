import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { PageIntro } from "../components/PageIntro";
import { getRuntimePowerBiEmbedUrl } from "../content/powerBiEmbed";

const kpis = [
  {
    name: "Customers currently out",
    definition: "Affected customers on the latest incident snapshot at the simulated as-of time. Do not sum hourly snapshots together.",
  },
  {
    name: "Active incidents",
    definition: "Incidents whose status is active at the simulated as-of time.",
  },
  {
    name: "Critical facility impacts",
    definition: "Active incident-level impacts associated with a critical facility at the simulated as-of time. This counts incident impacts, not distinct facility sites.",
  },
  {
    name: "30-day restoration compliance",
    definition: "Completed unplanned incidents restored within their severity-based target divided by completed unplanned incidents in the trailing 30-day period. Show the denominator with the rate.",
  },
  {
    name: "Active incidents without a crew",
    definition: "Active incidents with no current crew assignment at the simulated as-of time.",
  },
  {
    name: "High-priority active incidents",
    definition: "Active incidents classified as high priority by the fictional source model.",
  },
];

function ReportPanel({ embedUrl }: { embedUrl: string | undefined }) {
  if (embedUrl) {
    return (
      <>
        <p>If the embedded report does not load, <a className="text-link" href={embedUrl} target="_blank" rel="noreferrer">open it directly <ExternalLink aria-hidden="true" size={15} /></a>. Public availability depends on the report owner’s Power BI publishing settings.</p>
        <div className="grid-report-frame">
          <iframe
            title="Sierra North Energy synthetic grid operations report"
            src={embedUrl}
            loading="lazy"
            allowFullScreen
          />
        </div>
      </>
    );
  }

  return (
    <div className="grid-report-placeholder" role="status">
      <p className="eyebrow">Interactive report unavailable</p>
      <p>The public Power BI report link is not configured. The case study below remains available while the interactive report is unavailable.</p>
    </div>
  );
}

export function GridOperationsPage() {
  const embedUrl = getRuntimePowerBiEmbedUrl(import.meta.env.VITE_POWER_BI_EMBED_URL);
  return (
    <>
      <PageIntro
        eyebrow="Operations case study · fictional utility"
        title="Grid Operations Command Center"
        description="A portfolio case study for turning outage, crew, weather, and customer-impact data into a shared operations view. Every utility, customer, facility, outage, location, measurement, and result in this demonstration is synthetic."
      />

      <section className="section content-width grid-case-study" aria-label="Grid operations case study">
        <div className="grid-simulation-notice" role="note">
          <strong>Fixed simulation time:</strong> October 12, 2026 at 12:00 p.m. Pacific (PDT). This is a modeled snapshot, not a live operations feed.
        </div>

        <section className="grid-baseline" aria-labelledby="grid-baseline-heading">
          <div>
            <p className="eyebrow">Synthetic model summary</p>
            <h2 id="grid-baseline-heading">Imported report snapshot</h2>
            <p>Counts describe the fictional demonstration model at the fixed simulation clock above.</p>
          </div>
          <dl>
            <div><dt>Report pages</dt><dd>8</dd></div>
            <div><dt>Synthetic incidents</dt><dd>800</dd></div>
            <div><dt>Active incidents</dt><dd>20</dd></div>
            <div><dt>Current customers out</dt><dd>16,435</dd></div>
            <div><dt>Registered facilities</dt><dd>24</dd></div>
            <div><dt>Distinct facilities impacted</dt><dd>6</dd></div>
            <div><dt>Facilities fully covered</dt><dd>5 of 6</dd></div>
            <div><dt>Critical incident-facility links</dt><dd>7</dd></div>
            <div><dt>Crews · assignments</dt><dd>24 · 192</dd></div>
            <div><dt>Current crew positions · map points</dt><dd>24 · 82</dd></div>
            <div><dt>Historical SQL position observations</dt><dd>937</dd></div>
            <div><dt>Imported model tables</dt><dd>17</dd></div>
          </dl>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-problem-heading">
          <p className="eyebrow">Business problem</p>
          <h2 id="grid-problem-heading">A consistent picture for the next operating decision</h2>
          <p>Outage events, crew assignments, weather context, and hourly customer impact can tell different parts of the same story. A grid operations supervisor needs to identify which incidents deserve attention, understand the current customer and facility impact, and see whether restoration work is progressing. Reliability analysts also need historical views that do not inflate current impact by adding the same customers across multiple hourly snapshots.</p>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-persona-heading">
          <p className="eyebrow">Primary persona</p>
          <h2 id="grid-persona-heading">Grid operations supervisor</h2>
          <p>The supervisor uses the overview to prioritize active incidents and find unassigned work, then opens an incident timeline to review dispatch and restoration context. A reliability analyst uses the historical page to compare restoration performance over a clearly defined period. These are design personas for a fictional scenario, not interview participants.</p>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-architecture-heading">
          <p className="eyebrow">Architecture</p>
          <h2 id="grid-architecture-heading">Separate current state from hourly history</h2>
          <ol className="grid-architecture-list">
            <li><strong>SQL Server synthetic source</strong><span>Reference data, incidents, dispatch and crew records, weather context, a fixed demo clock, and hourly impact snapshots.</span></li>
            <li><strong>Reporting views</strong><span>Purpose-built incident, timeline, crew, weather, and hourly-impact views keep reporting logic close to the source model.</span></li>
            <li><strong>Power BI Import model</strong><span>Dimensions filter incident-level and hourly facts. Current impact comes from the latest applicable snapshot; historical trend charts use the hourly grain.</span></li>
            <li><strong>Portfolio presentation</strong><span>The report is a public Power BI embed of a synthetic imported model. It is illustrative and does not connect to live utility operations.</span></li>
          </ol>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-kpi-heading">
          <p className="eyebrow">KPI glossary</p>
          <h2 id="grid-kpi-heading">Definitions before dashboard totals</h2>
          <dl className="grid-kpi-list">
            {kpis.map((kpi) => (
              <div key={kpi.name}>
                <dt>{kpi.name}</dt>
                <dd>{kpi.definition}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-validation-heading">
          <p className="eyebrow">SQL validation</p>
          <h2 id="grid-validation-heading">Reconcile the report to its source grain</h2>
          <p>This read-only extract ranks the current active incident view by its fictional rule-based priority score. The score is a transparent demo heuristic, not a predictive model.</p>
          <pre className="grid-sql-example"><code>{`SELECT IncidentNumber, RegionName, CustomersOut,
       CriticalFacilitiesAffected, ETRStatus, CrewCode, PriorityScore
FROM rpt.vw_IncidentCurrent
ORDER BY PriorityScore DESC, CustomersOut DESC;`}</code></pre>
            <p>The SQL source includes separate schema, seed, and QA scripts for table and view presence, invalid or duplicate impact records, overlapping crew assignments, and source-grain reconciliation. The model summary above is a synthetic portfolio snapshot; current customer impact comes from the latest applicable incident snapshot, while hourly rows are used for trend analysis. Summing hourly rows would repeat customer impact across time.</p>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-limits-heading">
          <p className="eyebrow">Scope and limits</p>
          <h2 id="grid-limits-heading">A demonstration model, not utility operations software</h2>
          <ul className="grid-limits-list">
            <li>All organizations, people, customers, facilities, incidents, locations, weather, and measurements are fictional.</li>
            <li>Weather is contextual and does not establish that weather caused an outage.</li>
            <li>The fixed simulation clock does not update in real time.</li>
            <li>The simplified model does not support SAIDI or SAIFI claims.</li>
            <li>Crew positions are simulated, not GPS. Map points and boundaries are illustrative; they do not represent a live network topology. KPI target lines are illustrative design targets.</li>
            <li>A public Power BI embed can expose its imported model, so public release requires a full synthetic-data review.</li>
          </ul>
        </section>

        <section className="grid-study-section" aria-labelledby="grid-report-heading">
          <p className="eyebrow">Interactive exploration</p>
          <h2 id="grid-report-heading">Synthetic operations report</h2>
          <ReportPanel embedUrl={embedUrl} />
        </section>

        <nav className="grid-study-navigation" aria-label="Case study navigation">
          <Link className="text-link" to="/work"><ArrowLeft aria-hidden="true" size={16} /> Back to Work</Link>
          <a className="text-link" href="https://learn.microsoft.com/en-us/power-bi/collaborate-share/service-publish-to-web" target="_blank" rel="noreferrer">
            About public Power BI embeds <ExternalLink aria-hidden="true" size={15} />
          </a>
        </nav>
      </section>
    </>
  );
}
