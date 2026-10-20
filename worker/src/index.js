const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB; keep below Workers request-body limits
const ALLOWED_ORIGIN = "*"; // For production, replace "*" with your exact GitHub Pages/custom domain.

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN === "*" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}
function safeFilename(name) {
  return String(name || "dl").replace(/[\r\n"]/g, "_").slice(0, 240) || "download";
}
function contentDisposition(name) {
  const safe = safeFilename(name);
  const fallback = safe.replace(/[^\x20-\x7E]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
function randomId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("ShareBox API is running.", {
        headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/upload") {
      let form;
      try { form = await request.formData(); }
      catch { return json({ error: "Invalid upload form." }, 400, origin); }
      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") {
        return json({ error: "Choose a file to upload." }, 400, origin);
      }
      if (file.size === 0) return json({ error: "Empty files are not supported." }, 400, origin);
      if (file.size > MAX_FILE_BYTES) {
        return json({ error: "File exceeds the 100 MB demo limit." }, 413, origin);
      }

      const id = randomId();
      const filename = safeFilename(file.name);
      const type = (file.type || "application/octet-stream").slice(0, 150);
      try {
        await env.FILES.put(id, file.stream(), {
          httpMetadata: { contentType: type, cacheControl: "public, max-age=3600" },
          customMetadata: { filename, originalType: type, uploadedAt: new Date().toISOString() }
        });
      } catch (err) {
        return json({ error: "Storage failed. Check your R2 binding and account limits." }, 500, origin);
      }
      return json({ id, filename, size: file.size, shareUrl: `${url.origin}/download/${id}` }, 201, origin);
    }

    const match = url.pathname.match(/^\/dl\/([a-f0-9]{36})$/);
    if (request.method === "GET" && match) {
      const id = match[1];
      const object = await env.FILES.get(id);
      if (!object) {
        return new Response("File not found or no longer available.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) }
        });
      }
      const headers = new Headers(corsHeaders(origin));
      headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
      headers.set("Content-Disposition", contentDisposition(object.customMetadata?.filename || "download"));
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Length", String(object.size));
      return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
    }

    if (request.method === "GET" && url.pathname.startsWith("/dl/")) {
      return new Response("Invalid file link.", { status: 400, headers: corsHeaders(origin) });
    }
    return json({ error: "Not found." }, 404, origin);
  }
};
