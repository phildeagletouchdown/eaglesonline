const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2] || process.env.PORT || 3000);
const siteDir = path.join(__dirname, "docs");
const dataDir = path.join(__dirname, "data");
const showsDbPath = path.join(__dirname, "data", "shows.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon"
};

function resolvePath(urlPath, baseDir = siteDir) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const filePath = cleanPath === "/" ? "/index.html" : cleanPath;
  const resolved = path.normalize(path.join(baseDir, filePath));

  if (!resolved.startsWith(baseDir)) {
    return null;
  }

  return resolved;
}

function sendFile(res, resolved) {
  fs.readFile(resolved, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function localDateISO(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeShow(show) {
  const date = normalizeDate(show.date);

  return {
    date,
    location: String(show.location || ""),
    bands: Array.isArray(show.bands) ? show.bands.map(String) : []
  };
}

function normalizeDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function categorizeShows(shows, today = localDateISO()) {
  const normalized = shows.map(normalizeShow).filter((show) => show.date && show.location);
  const future = normalized
    .filter((show) => show.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = normalized
    .filter((show) => show.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return { today, future, past };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function formatBands(bands) {
  return bands.length > 0 ? bands.join(" / ") : "tba";
}

function showLine(show) {
  return `${show.date}  ${show.location}\n            ${formatBands(show.bands)}`;
}

function showSection(title, shows) {
  const lines = shows.length > 0 ? shows.map(showLine).join("\n\n") : "none listed";
  return `${title}\n${"-".repeat(title.length)}\n${lines}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendShowsPage(res) {
  fs.readFile(path.join(siteDir, "shows.html"), "utf8", (htmlError, html) => {
    if (htmlError) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Could not read shows page.");
      return;
    }

    fs.readFile(showsDbPath, "utf8", (dataError, data) => {
      if (dataError) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Could not read shows database.");
        return;
      }

      try {
        const shows = categorizeShows(JSON.parse(data));
        const rendered = `${showSection("future shows", shows.future)}\n\n${showSection("past shows", shows.past)}`;
        const page = html
          .replace("current date: loading", `current date: ${escapeHtml(shows.today)}`)
          .replace("loading shows database", escapeHtml(rendered));

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(page);
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Shows database is not valid JSON.");
      }
    });
  });
}

const server = http.createServer((req, res) => {
  const cleanPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (cleanPath === "/shows.html" || cleanPath === "/shows") {
    sendShowsPage(res);
    return;
  }

  if (cleanPath === "/api/shows") {
    fs.readFile(showsDbPath, "utf8", (error, data) => {
      if (error) {
        sendJson(res, 500, { error: "Could not read shows database." });
        return;
      }

      try {
        sendJson(res, 200, categorizeShows(JSON.parse(data)));
      } catch {
        sendJson(res, 500, { error: "Shows database is not valid JSON." });
      }
    });
    return;
  }

  if (cleanPath.startsWith("/data/")) {
    const resolved = resolvePath(cleanPath.slice("/data".length), dataDir);

    if (!resolved) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    sendFile(res, resolved);
    return;
  }

  const resolved = resolvePath(req.url || "/");

  if (!resolved) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  sendFile(res, resolved);
});

server.listen(port, () => {
  console.log(`pretext site running at http://localhost:${port}`);
});
