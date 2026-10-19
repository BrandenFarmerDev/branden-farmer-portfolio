/** Saves text as a file entirely in the browser; the only data that ever leaves the page is this explicit user download. */
export function downloadCsv(content: string, filename = "job-applications.csv"): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
