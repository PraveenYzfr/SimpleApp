import { createApp } from "./app.js";

const app = createApp();

async function serveAsset(env, path) {
  const url = new URL(path, "https://assets.local");
  return env.ASSETS.fetch(new Request(url));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API handled by Hono
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    // Pretty routes for landing + demo (match Express layout)
    if (url.pathname === "/" || url.pathname === "") {
      return serveAsset(env, "/landing/index.html");
    }
    if (url.pathname === "/demo" || url.pathname === "/demo/") {
      return serveAsset(env, "/demo/index.html");
    }
    if (url.pathname === "/demo/styles.css") {
      const res = await serveAsset(env, "/styles.css");
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(res.body, { status: res.status, headers });
    }
    if (url.pathname === "/demo/app.js") {
      const res = await serveAsset(env, "/app.js");
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(res.body, { status: res.status, headers });
    }
    if (url.pathname.startsWith("/demo/")) {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(res.body, { status: res.status, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
