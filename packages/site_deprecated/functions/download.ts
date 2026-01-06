/**
 * Download handler - redirects to R2 public URL
 *
 * Routes:
 *   /download        -> redirects to latest DMG for current platform
 *   /download/mac    -> latest macOS DMG
 *   /download/win    -> latest Windows installer (future)
 *   /download/linux  -> latest Linux package (future)
 */

interface Env {
  RELEASES?: R2Bucket;
  R2_PUBLIC_URL?: string; // e.g., "https://releases.hands.app" or R2.dev URL
}

// R2 public URL
const DEFAULT_R2_URL = "https://pub-aa371ada4bad4657853c1582c404f5aa.r2.dev";

export async function onRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Determine platform from path or User-Agent
  let platform = "mac"; // default

  if (path.includes("/download/mac")) {
    platform = "mac";
  } else if (path.includes("/download/win")) {
    platform = "win";
  } else if (path.includes("/download/linux")) {
    platform = "linux";
  } else {
    // Auto-detect from User-Agent
    const ua = context.request.headers.get("User-Agent") || "";
    if (ua.includes("Windows")) {
      platform = "win";
    } else if (ua.includes("Linux")) {
      platform = "linux";
    }
  }

  const filename = getLatestFilename(platform);
  const r2Url = context.env.R2_PUBLIC_URL || DEFAULT_R2_URL;

  // If R2 binding exists, stream directly
  if (context.env.RELEASES) {
    try {
      const object = await context.env.RELEASES.get(filename);

      if (!object) {
        return new Response(`Release not found: ${filename}`, { status: 404 });
      }

      const headers = new Headers();
      headers.set("Content-Type", getContentType(platform));
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      headers.set("Content-Length", object.size.toString());
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");

      return new Response(object.body, { headers });
    } catch (error) {
      console.error("R2 error, falling back to redirect:", error);
    }
  }

  // Fallback: redirect to R2 public URL
  const downloadUrl = `${r2Url}/${filename}`;
  return Response.redirect(downloadUrl, 302);
}

function getLatestFilename(platform: string): string {
  // Use versioned filenames - update version here when releasing
  switch (platform) {
    case "mac":
      return "Hands_0.1.0_aarch64.dmg";
    case "win":
      return "Hands_0.1.0_x64.msi";
    case "linux":
      return "Hands_0.1.0_amd64.deb";
    default:
      return "Hands_0.1.0_aarch64.dmg";
  }
}

function getContentType(platform: string): string {
  switch (platform) {
    case "mac":
      return "application/x-apple-diskimage";
    case "win":
      return "application/x-msi";
    case "linux":
      return "application/vnd.debian.binary-package";
    default:
      return "application/octet-stream";
  }
}
