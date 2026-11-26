export default async function handler(req, res) {
  const {
    GH_TOKEN,
    GH_OWNER,
    GH_REPO,
    GH_BRANCH = "main",
    ACCESS_PIN,
  } = process.env;

  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return res.status(500).json({ error: "Vercel Environment Variables sozlanmagan (GH_TOKEN, GH_OWNER, GH_REPO)." });
  }

  // Ixtiyoriy kirish PIN tekshiruvi
  if (ACCESS_PIN) {
    const clientPin = req.headers["x-access-pin"] || req.query.pin;
    if (clientPin !== ACCESS_PIN) {
      return res.status(401).json({ error: "Kirish PIN kodi noto'g'ri." });
    }
  }

  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const baseUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents`;

  try {
    if (req.method === "GET") {
      const { path = "vault" } = req.query;
      const ghRes = await fetch(`${baseUrl}/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${GH_BRANCH}`, {
        headers,
      });

      if (ghRes.status === 404) {
        return res.status(200).json({ items: [] });
      }
      const data = await ghRes.json();
      if (!ghRes.ok) {
        return res.status(ghRes.status).json({ error: data.message || "GitHub GET xatosi" });
      }

      if (Array.isArray(data)) {
        return res.status(200).json({
          items: data.map((item) => ({
            name: item.name,
            path: item.path,
            size: item.size,
            sha: item.sha,
            type: item.type,
          })),
        });
      }

      return res.status(200).json({
        name: data.name,
        path: data.path,
        sha: data.sha,
        content: data.content || null,
        download_url: data.download_url || null,
      });
    }

    if (req.method === "POST") {
      const { path, contentBase64, message } = req.body || {};
      if (!path || !contentBase64) {
        return res.status(400).json({ error: "path va contentBase64 majburiy." });
      }

      const cleanPath = path.replace(/^\/+/, "");
      const url = `${baseUrl}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;

      // Mavjud fayl bo'lsa sha olamiz
      let sha;
      const checkRes = await fetch(`${url}?ref=${GH_BRANCH}`, { headers });
      if (checkRes.status === 200) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }

      const putRes = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: message || `Vault sync: ${cleanPath}`,
          content: contentBase64,
          branch: GH_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });

      const putData = await putRes.json();
      if (!putRes.ok) {
        return res.status(putRes.status).json({ error: putData.message || "GitHub PUT xatosi" });
      }

      return res.status(200).json({ ok: true, path: cleanPath, sha: putData.content?.sha });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server xatosi" });
  }
}
