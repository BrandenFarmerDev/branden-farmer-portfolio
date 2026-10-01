import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ABOUT_OVERVIEW_ID, anchorId, chunk, ROLE_HIGHLIGHT_CHUNK, WORKING_PRINCIPLES_ID } from "./content/anchors";
import { resumeContent } from "./content/resume";
import { careerMilestones, experienceAreas } from "./content/site";

vi.mock("@calcom/embed-react", () => ({
  getCalApi: vi.fn().mockRejectedValue(new Error("embed unavailable in unit tests")),
}));

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

describe("portfolio routes", () => {
  it.each([
    ["/", "Branden Farmer"],
    ["/work", "Tools shaped around real decisions"],
    ["/about", "Technical depth with an operations point of view"],
    ["/resume", "Experience across operations, data, and development"],
    ["/contact", "Start with the channel that works for you"],
    ["/ask", "Questions answered from approved evidence"],
    ["/privacy", "What this site keeps, and for how long"],
  ])("renders %s", async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Branden Farmer on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/BrandenFarmerDev",
    );
  });

  it("keeps unfinished work labelled and keeps owner tools out of navigation", async () => {
    const { unmount } = renderRoute("/work");
    expect(await screen.findAllByText("Prototype - in development")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /Owner/ })).not.toBeInTheDocument();
    unmount();

    renderRoute("/ask");
    expect(await screen.findByRole("button", { name: "Ask Branden" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("link", { name: "Contact Branden or book time" })).toHaveAttribute("href", "/contact");
  });

  it("links home project summaries to hash targets without self-links on Work", async () => {
    const { unmount } = renderRoute("/");
    const outlineLinks = await screen.findAllByRole("link", { name: /View project outline/ });
    expect(outlineLinks).toHaveLength(3);
    expect(outlineLinks[0]).toHaveAttribute("href", "/work#job-search-intelligence");
    unmount();

    renderRoute("/work");
    await screen.findByRole("heading", { name: "Tools shaped around real decisions" });
    expect(screen.queryByRole("link", { name: /View project outline/ })).not.toBeInTheDocument();
  });

  it("scrolls a hash-targeted project into view", async () => {
    renderRoute("/work#job-search-intelligence");
    await screen.findByRole("heading", { name: "Tools shaped around real decisions" });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  });

  it("scrolls to, highlights, and focuses an exact résumé passage", async () => {
    const passageId = "role-business-intelligence-developer-iii-2";
    renderRoute(`/resume#${passageId}`);
    await screen.findByRole("heading", { name: "Professional experience" });

    await waitFor(() => expect(document.getElementById(passageId)).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    const highlighted = document.querySelectorAll("[data-hash-active]");
    expect(highlighted).toHaveLength(ROLE_HIGHLIGHT_CHUNK);
    expect(highlighted[0]).toHaveTextContent(resumeContent.experience[0].roles[0].highlights[ROLE_HIGHLIGHT_CHUNK]);
  });

  it("renders every anchor the Ask evidence corpus links to", async () => {
    const { unmount } = renderRoute("/resume");
    await screen.findByRole("heading", { name: "Professional experience" });
    const resumeIds = [
      ...resumeContent.experience.flatMap((employer) => employer.roles.flatMap((role) =>
        chunk(role.highlights, ROLE_HIGHLIGHT_CHUNK).map((_, index) => anchorId.role(role.title, index)))),
      ...resumeContent.skillGroups.map((group) => anchorId.skill(group.title)),
      ...resumeContent.selectedProjects.map((project) => anchorId.resumeProject(project.title)),
    ];
    for (const id of resumeIds) expect(document.getElementById(id), id).not.toBeNull();
    unmount();

    renderRoute("/about");
    await screen.findByRole("heading", { name: "From the workbench to connected systems" });
    const aboutIds = [ABOUT_OVERVIEW_ID, WORKING_PRINCIPLES_ID,
      ...experienceAreas.map((area) => anchorId.area(area.title)),
      ...careerMilestones.map((milestone) => anchorId.career(milestone.title))];
    for (const id of aboutIds) expect(document.getElementById(id), id).not.toBeNull();
  });

  it("moves focus to main content when a hash target is missing", async () => {
    renderRoute("/about#missing-passage");
    await screen.findByRole("heading", { name: "From the workbench to connected systems" });
    await waitFor(() => expect(document.getElementById("main-content")).toHaveFocus());
  });

  it("exposes the PDF download and the public portfolio source", async () => {
    const { unmount } = renderRoute("/resume");
    expect(await screen.findByRole("link", { name: /Download PDF/ })).toHaveAttribute(
      "href",
      "/Branden_Farmer_Resume.pdf",
    );
    unmount();

    renderRoute("/about");
    expect(await screen.findByRole("link", { name: /Portfolio source/ })).toHaveAttribute(
      "href",
      "https://github.com/BrandenFarmerDev/branden-farmer-portfolio",
    );
  });

  it("has no automatically detectable accessibility violations on the About page", async () => {
    const { container } = renderRoute("/about");
    await screen.findByRole("heading", { name: "From the workbench to connected systems" });
    await waitFor(async () => {
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations).toEqual([]);
    });
  });
});
