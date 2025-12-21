/**
 * Download a file from a URL
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || url.split("/").pop() || "download";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
