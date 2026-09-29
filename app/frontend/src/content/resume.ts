export interface ResumeRole {
  title: string;
  dates: string;
  highlights: string[];
}

export interface ResumeEmployer {
  name: string;
  location: string;
  roles: ResumeRole[];
}

export interface ResumeDetail {
  title: string;
  organization?: string;
  date?: string;
  note?: string;
}

export const resumeContent = {
  headline: "Business Intelligence | Data Engineering | Operational Analytics",
  location: "Fernley, NV",
  phone: "(775) 636-3905",
  phoneHref: "tel:+17756363905",
  email: "branden_farmer@live.com",
  emailHref: "mailto:branden_farmer@live.com",
  summary:
    "Business intelligence and application developer with 10+ years of experience across analytics, data engineering, production planning, and manufacturing. Builds Power BI, Power Apps, Power Automate, SharePoint, and Palantir Foundry solutions using SQL, Python, and TypeScript to support operational planning and executive decisions.",
  experience: [
    {
      name: "Sierra Nevada Corporation",
      location: "Sparks, NV",
      roles: [
        {
          title: "Business Intelligence Developer III",
          dates: "May 2022 - Present",
          highlights: [
            "Design and deliver enterprise BI, analytics, and operational applications using Power BI, Palantir Foundry, SQL, and Python, improving decision-making efficiency by 10% and generating approximately $30,000 in annual savings.",
            "Build and maintain Power BI dashboards, custom Power BI visuals, semantic models, DAX measures, Power Query transformations, and KPI reporting that translate complex operational data into actionable insights.",
            "Build Palantir Foundry operational applications using Workshop, Ontology, Actions, and function-backed workflows for planning, KPI tracking, data-quality exceptions, workflow management, and decision traceability.",
            "Engineer automated ETL/ELT and data-integration workflows across SQL Server, PostgreSQL/AWS RDS, SharePoint, and REST/Graph/GraphQL APIs with validation, logging, exception handling, and data-quality controls.",
            "Developed and implemented 10+ Power Apps and Power Automate solutions, reducing manual workload by 25% while improving workflow visibility, standardization, and accountability.",
            "Develop SharePoint Online solutions, including SharePoint Framework (SPFx) web parts, and custom Power Apps Component Framework (PCF) controls using TypeScript and JavaScript.",
            "Author and optimize advanced SQL queries, views, stored procedures, and data models for reporting, data warehousing, application backends, and ad hoc analysis.",
            "Build Python automations for data manipulation, reconciliation, cost analysis, scheduled processing, RPA, and automated report generation.",
            "Perform cost analysis and data-quality validation using Python and SQL, identifying process improvements and supporting more reliable resource allocation.",
            "Partner with business leaders, IT, cybersecurity, and platform teams to gather requirements, map processes, define KPIs, document solutions, and deliver governed analytics in enterprise environments.",
          ],
        },
        {
          title: "Planning Supervisor",
          dates: "Oct 2021 - May 2022",
          highlights: [
            "Led a team of production planners and managed schedules, material constraints, capacity, and KPIs to support on-time delivery.",
            "Applied SQL, Power BI, Excel, and business process mapping to improve forecasting and planning accuracy, reducing lead times by 20%.",
            "Created Python and SQL automation tools and used proactive shortage analytics to avoid an estimated $20,000 in expediting fees.",
          ],
        },
        {
          title: "Production Planner",
          dates: "Jan 2019 - Oct 2021",
          highlights: [
            "Developed and maintained production schedules that achieved 95% on-time delivery and improved overall production efficiency by 10%.",
            "Created Power BI dashboards, SQL analyses, and Excel/VBA applications that automated reporting and improved visibility into schedule, material, and operational performance.",
            "Queried the enterprise data warehouse and translated supply, demand, material, and schedule data into timely planning decisions.",
          ],
        },
        {
          title: "Lead Production Technician",
          dates: "Jan 2018 - Jan 2019",
          highlights: [
            "Led and trained technicians while building Excel VBA, SQL, and Microsoft Access tools for material tracking and production reporting; training improved team skills and performance by 25%.",
          ],
        },
        {
          title: "Production Technician",
          dates: "Aug 2016 - Jan 2018",
          highlights: [
            "Built Excel VBA reports, macros, and Access-based data tools to improve quality and production tracking while assembling and testing products to technical standards.",
          ],
        },
      ],
    },
    {
      name: "Server Technology",
      location: "Reno, NV",
      roles: [
        {
          title: "Assembly Technician",
          dates: "Jan 2014 - Aug 2016",
          highlights: [
            "Automated Excel reporting for production tracking, improved data accuracy, and provided management with timely operational metrics while assembling server power distribution units.",
          ],
        },
      ],
    },
  ] satisfies ResumeEmployer[],
  skillGroups: [
    {
      title: "Business Intelligence",
      skills:
        "Power Platform (Power BI, Power Apps, Power Automate), custom Power BI visuals, DAX, Power Query (M), semantic models, dashboards, KPI reporting, executive reporting, data visualization, self-service BI, operational analytics, forecasting, cost analysis",
    },
    {
      title: "Data Engineering & Databases",
      skills:
        "SQL, SQL Server, PostgreSQL, AWS RDS, ETL/ELT, data pipelines, data warehousing, data modeling, schema design, stored procedures, views, query optimization, data integration, data quality, reconciliation",
    },
    {
      title: "Development & Automation",
      skills:
        "Python, TypeScript, JavaScript, C# and .NET, Rust, React, Node.js, Power Apps Component Framework (PCF), SharePoint Framework (SPFx), Advanced Excel/VBA, RPA, REST APIs, Microsoft Graph API, GraphQL, JSON, HTML/CSS",
    },
    {
      title: "Platforms & Delivery",
      skills:
        "Palantir Foundry (Workshop, Ontology, Actions, AIP), SharePoint Online development, Microsoft 365, Azure Functions, Azure SQL, API Management, Key Vault, Application Insights, Git/GitHub, CI/CD",
    },
    {
      title: "Business Capabilities",
      skills:
        "business planning, production planning, capacity and material planning, supply/demand analysis, KPI definition, requirements gathering, stakeholder management, process improvement, workflow design, UAT, Lean Six Sigma, team leadership",
    },
  ],
  selectedProjects: [
    {
      title: "Enterprise data integration",
      description:
        "Designed Python and API-based ingestion patterns across SharePoint, SQL Server, PostgreSQL/AWS RDS, REST/GraphQL, and Microsoft Graph with deduplication, validation, retries, logging, and scheduled execution.",
    },
    {
      title: "Palantir Foundry operational applications",
      description:
        "Designed ontology-driven Workshop applications and function-backed Actions for planning, assignment, data-quality exceptions, KPI tracking, decision traceability, and AI/LLM-assisted analysis.",
    },
    {
      title: "Secure application and analytics architecture",
      description:
        "Contributed to designs using Entra ID and OAuth, Azure Functions, API Management, Azure SQL, Key Vault, Application Insights, GitHub, and CI/CD controls.",
    },
  ],
  education: [
    {
      title: "Bachelor of Science in Computer Science",
      organization: "Western Governors University (WGU)",
      date: "In progress (2026)",
    },
    {
      title: "IBM Full Stack Application Development MicroBachelors Program Certificate",
      organization: "edX / IBM",
      date: "Dec 2025",
    },
    {
      title: "High School Diploma, General Education",
      organization: "Sacramento Academic and Vocational Academy",
      date: "Jun 2009",
    },
  ] satisfies ResumeDetail[],
  training: [
    {
      title: "Palantir American Tech Fellowship",
      organization: "Palantir Technologies",
      date: "Mar 2026",
      note: "8-week intensive Foundry & AIP training",
    },
    {
      title: "Supervisory Management Certificate",
      organization: "UNR Extended Studies",
      date: "Jan 2021",
    },
    {
      title: "Lean Six Sigma Green Belt",
      organization: "UNR Extended Studies",
      date: "Jan 2019",
    },
    {
      title: "Lean Manufacturing 101 Certificate",
      organization: "UNR Extended Studies",
      date: "Jan 2017",
    },
  ] satisfies ResumeDetail[],
  recognition: [
    "2018 STAR Award recipient for innovation and efficiency in business processes.",
    "Three-time DTU Award finalist (2021, 2022, and 2023) for technical expertise and leadership.",
  ],
} as const;
