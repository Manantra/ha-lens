import { toPng, toSvg } from "html-to-image";

export type GraphExportFormat = "png" | "svg";

function safeFilename(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "home-assistant-automation";
}

export async function exportAutomationGraph(title: string, format: GraphExportFormat): Promise<void> {
  const element = document.querySelector<HTMLElement>("[data-export-graph]");
  if (!element) throw new Error("Automation graph is not available for export.");

  const common = {
    backgroundColor: "#0d1016",
    cacheBust: true,
  };

  const dataUrl = format === "png"
    ? await toPng(element, { ...common, pixelRatio: 2 })
    : await toSvg(element, common);

  const link = document.createElement("a");
  link.download = `${safeFilename(title)}.${format}`;
  link.href = dataUrl;
  link.click();
}
