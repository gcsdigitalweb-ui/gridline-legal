const { getSession, setSessionCookie, clearSessionCookie } = require("../lib/session");
const { readCompanies, writeCompanies, readConfig, writeConfig } = require("../lib/store");

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  DISCORD_GUILD_ID,
} = process.env;

// Ce compte Discord a TOUJOURS les droits admin complets, quels que soient ses roles.
// Configurable via la variable d'environnement OWNER_DISCORD_ID sur Vercel.
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || "1501730550451273728";

// Liste des permissions granulaires configurables par rôle Discord admin.
// L'ordre et les clés doivent correspondre exactement à PERMISSION_DEFS côté app.js
const PERMISSION_KEYS = [
  "deleteCompany",
  "createCompany",
  "editCategory",
  "editDefaultPercent",
  "editCoffre",
  "editDiscordRoleId",
  "manageAdminRoles",
];

const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function emptyPermissions() {
  const p = {};
  PERMISSION_KEYS.forEach((k) => (p[k] = false));
  return p;
}

function fullPermissions() {
  const p = {};
  PERMISSION_KEYS.forEach((k) => (p[k] = true));
  return p;
}

function sanitizePermissions(perm) {
  const p = emptyPermissions();
  if (perm && typeof perm === "object") {
    PERMISSION_KEYS.forEach((k) => {
      if (perm[k] !== undefined) p[k] = !!perm[k];
    });
  }
  return p;
}

// Convertit la config brute en liste normalisée [{ roleId, permissions }, ...].
// Gère la migration depuis les anciens formats (adminRoleId string unique,
// ou adminRoleIds liste simple d'IDs = admin complet historique).
function normalizeAdminRoles(config) {
  if (Array.isArray(config.adminRoles)) {
    return config.adminRoles
      .map((r) => ({
        roleId: String((r && r.roleId) || "").trim(),
        permissions: sanitizePermissions(r && r.permissions),
      }))
      .filter((r) => r.roleId);
  }
  let ids = [];
  if (Array.isArray(config.adminRoleIds)) ids = config.adminRoleIds;
  else if (config.adminRoleId) ids = [config.adminRoleId];
  return ids
    .map((id) => String(id).trim())
    .filter(Boolean)
    .map((roleId) => ({ roleId, permissions: fullPermissions() }));
}

function computePermissions(config, companies, discordId, discordRoles) {
  const adminRoles = normalizeAdminRoles(config);
  const bootstrap = adminRoles.length === 0;
  const isOwner = discordId === OWNER_DISCORD_ID;
  const matchedRoles = adminRoles.filter((r) => discordRoles.includes(r.roleId));
  const isAdmin = isOwner || bootstrap || matchedRoles.length > 0;

  let permissions;
  if (isOwner || bootstrap) {
    // Le propriétaire, et tout le monde en mode initialisation, a tous les droits.
    permissions = fullPermissions();
  } else {
    permissions = emptyPermissions();
    matchedRoles.forEach((r) => {
      PERMISSION_KEYS.forEach((k) => {
        if (r.permissions[k]) permissions[k] = true;
      });
    });
  }

  const patronCompanyIds = companies
    .filter((c) => c.discordRoleId && discordRoles.includes(c.discordRoleId))
    .map((c) => c.id);

  return {
    isAdmin: !!isAdmin,
    isOwner: !!isOwner,
    patronCompanyIds,
    bootstrap,
    adminRoles,
    permissions,
  };
}

function findSheet(companies, companyId, sheetId) {
  const c = companies.find((x) => x.id === companyId);
  if (!c) return {};
  const s = c.sheets.find((x) => x.id === sheetId);
  return { c, s };
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body || "{}");
      } catch {
        return {};
      }
    }
    return req.body || {};
  }
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  const method = req.method;
  const segs = pathname.split("/").filter(Boolean); // ex: ["api","companies","c1","sheets","s1"]

  try {
    // ---------- Auth Discord ----------
    if (pathname === "/auth/discord" && method === "GET") {
      const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: "code",
        scope: "identify guilds.members.read",
        prompt: "consent",
      });
      res.writeHead(302, { Location: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
      return res.end();
    }

    if (pathname === "/auth/discord/callback" && method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(302, { Location: "/?error=missing_code" });
        return res.end();
      }
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI,
        }),
      });
      if (!tokenRes.ok) {
        res.writeHead(302, { Location: "/?error=auth_failed" });
        return res.end();
      }
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await userRes.json();

      let roles = [];
      const memberRes = await fetch(
        `https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (memberRes.ok) {
        const member = await memberRes.json();
        roles = member.roles || [];
      }

      setSessionCookie(res, { id: user.id, username: user.username, avatar: user.avatar, roles });
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    if (pathname === "/auth/logout" && method === "GET") {
      clearSessionCookie(res);
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    // ---------- API ----------
    const discord = getSession(req);

    if (pathname === "/api/session" && method === "GET") {
      if (!discord) return json(res, 200, { loggedIn: false });
      const config = await readConfig();
      const companies = await readCompanies();
      const perms = computePermissions(config, companies, discord.id, discord.roles);
      return json(res, 200, {
        loggedIn: true,
        user: { id: discord.id, username: discord.username, avatar: discord.avatar },
        isAdmin: perms.isAdmin,
        isOwner: perms.isOwner,
        bootstrap: perms.bootstrap,
        patronCompanyIds: perms.patronCompanyIds,
        permissions: perms.permissions,
      });
    }

    if (!discord) return json(res, 401, { error: "Non connecte" });

    const config = await readConfig();
    let companies = await readCompanies();
    const perms = computePermissions(config, companies, discord.id, discord.roles);
    const canAccessCompany = (id) => perms.isAdmin || perms.patronCompanyIds.includes(id);
    const canFull = perms.isOwner || perms.bootstrap;

    // /api/config
    if (pathname === "/api/config" && method === "GET") {
      if (!perms.isAdmin) return json(res, 403, { error: "Reserve aux admins" });
      return json(res, 200, { adminRoles: perms.adminRoles });
    }
    if (pathname === "/api/config" && method === "PUT") {
      // Gerer la liste des roles admin (ajout/retrait/permissions) est reserve
      // au proprietaire, au mode d'initialisation, ou a quiconque possede la
      // permission "manageAdminRoles" via un de ses roles.
      const canManageRoles = canFull || perms.permissions.manageAdminRoles;
      if (!canManageRoles) {
        return json(res, 403, { error: "Reserve aux personnes autorisees a gerer les roles admin" });
      }
      const body = await readBody(req);
      let adminRoles = normalizeAdminRoles(config);

      if (typeof body.addRoleId === "string" && body.addRoleId.trim()) {
        const roleId = body.addRoleId.trim();
        if (!adminRoles.some((r) => r.roleId === roleId)) {
          adminRoles.push({ roleId, permissions: fullPermissions() });
        }
      }
      if (typeof body.removeRoleId === "string" && body.removeRoleId.trim()) {
        adminRoles = adminRoles.filter((r) => r.roleId !== body.removeRoleId.trim());
      }
      if (body.updatePermissions && typeof body.updatePermissions.roleId === "string") {
        const roleId = body.updatePermissions.roleId.trim();
        const patch = body.updatePermissions.permissions || {};
        adminRoles = adminRoles.map((r) =>
          r.roleId === roleId
            ? { ...r, permissions: sanitizePermissions({ ...r.permissions, ...patch }) }
            : r
        );
      }

      config.adminRoles = adminRoles;
      delete config.adminRoleId;
      delete config.adminRoleIds;
      await writeConfig(config);
      return json(res, 200, { adminRoles: normalizeAdminRoles(config) });
    }

    // /api/companies
    if (pathname === "/api/companies" && method === "GET") {
      const visible = perms.isAdmin ? companies : companies.filter((c) => perms.patronCompanyIds.includes(c.id));
      return json(res, 200, visible);
    }
    if (pathname === "/api/companies" && method === "POST") {
      if (!(canFull || perms.permissions.createCompany)) {
        return json(res, 403, { error: "Permission manquante : creer une entreprise" });
      }
      const c = {
        id: uid(),
        name: "Nouvelle entreprise",
        defaultPercent: 10,
        coffre: 0,
        discordRoleId: "",
        category: "",
        sheets: [{ id: uid(), dateDebut: today(), dateFin: plusDays(today(), 6), locked: false, employees: [], expenses: [] }],
      };
      companies.push(c);
      await writeCompanies(companies);
      return json(res, 200, c);
    }

    // /api/companies/:id
    if (segs.length === 3 && segs[0] === "api" && segs[1] === "companies") {
      const companyId = segs[2];
      if (method === "PATCH") {
        if (!perms.isAdmin) return json(res, 403, { error: "Reserve aux admins" });
        const c = companies.find((x) => x.id === companyId);
        if (!c) return json(res, 404, { error: "Introuvable" });
        const body = await readBody(req);

        // Le nom reste modifiable par tout admin (pas de permission dediee demandee).
        if (body.name !== undefined) c.name = body.name;

        if (body.category !== undefined) {
          if (!(canFull || perms.permissions.editCategory)) {
            return json(res, 403, { error: "Permission manquante : modifier la categorie" });
          }
          c.category = String(body.category).trim();
        }
        if (body.defaultPercent !== undefined) {
          if (!(canFull || perms.permissions.editDefaultPercent)) {
            return json(res, 403, { error: "Permission manquante : modifier la commission par defaut" });
          }
          c.defaultPercent = Number(body.defaultPercent);
        }
        if (body.coffre !== undefined) {
          if (!(canFull || perms.permissions.editCoffre)) {
            return json(res, 403, { error: "Permission manquante : modifier le coffre" });
          }
          c.coffre = Number(body.coffre);
        }
        if (body.discordRoleId !== undefined) {
          if (!(canFull || perms.permissions.editDiscordRoleId)) {
            return json(res, 403, { error: "Permission manquante : modifier le role Discord lie" });
          }
          c.discordRoleId = String(body.discordRoleId).trim();
        }

        await writeCompanies(companies);
        return json(res, 200, c);
      }
      if (method === "DELETE") {
        if (!(canFull || perms.permissions.deleteCompany)) {
          return json(res, 403, { error: "Permission manquante : supprimer une entreprise" });
        }
        companies = companies.filter((c) => c.id !== companyId);
        await writeCompanies(companies);
        return json(res, 200, { ok: true });
      }
    }

    // /api/companies/:id/sheets
    if (segs.length === 4 && segs[0] === "api" && segs[1] === "companies" && segs[3] === "sheets" && method === "POST") {
      const companyId = segs[2];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const c = companies.find((x) => x.id === companyId);
      if (!c) return json(res, 404, { error: "Introuvable" });
      const last = c.sheets[c.sheets.length - 1];
      const s = { id: uid(), dateDebut: today(), dateFin: plusDays(today(), 6), locked: false, employees: [], expenses: [] };
      if (last) {
        s.dateDebut = plusDays(last.dateFin, 1);
        s.dateFin = plusDays(s.dateDebut, 6);
      }
      c.sheets.push(s);
      await writeCompanies(companies);
      return json(res, 200, s);
    }

    // /api/companies/:id/sheets/:sheetId
    if (segs.length === 5 && segs[0] === "api" && segs[1] === "companies" && segs[3] === "sheets") {
      const companyId = segs[2];
      const sheetId = segs[4];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const { s } = findSheet(companies, companyId, sheetId);
      if (!s) return json(res, 404, { error: "Introuvable" });
      if (method === "PATCH") {
        if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
        const body = await readBody(req);
        if (body.dateDebut !== undefined) s.dateDebut = body.dateDebut;
        if (body.dateFin !== undefined) s.dateFin = body.dateFin;
        await writeCompanies(companies);
        return json(res, 200, s);
      }
    }

    // /api/companies/:id/sheets/:sheetId/lock
    if (segs.length === 6 && segs[5] === "lock" && method === "PATCH") {
      if (!perms.isAdmin) return json(res, 403, { error: "Reserve aux admins" });
      const { s } = findSheet(companies, segs[2], segs[4]);
      if (!s) return json(res, 404, { error: "Introuvable" });
      const body = await readBody(req);
      s.locked = !!body.locked;
      await writeCompanies(companies);
      return json(res, 200, s);
    }

    // /api/companies/:id/sheets/:sheetId/employees
    if (segs.length === 6 && segs[5] === "employees" && method === "POST") {
      const companyId = segs[2], sheetId = segs[4];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const { s } = findSheet(companies, companyId, sheetId);
      if (!s) return json(res, 404, { error: "Introuvable" });
      if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
      const e = { id: uid(), name: "Nouvel employe", ca: 0, percent: null, prime: 0, paid: false };
      s.employees.push(e);
      await writeCompanies(companies);
      return json(res, 200, e);
    }

    // /api/companies/:id/sheets/:sheetId/employees/:empId
    if (segs.length === 7 && segs[5] === "employees") {
      const companyId = segs[2], sheetId = segs[4], empId = segs[6];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const { s } = findSheet(companies, companyId, sheetId);
      if (!s) return json(res, 404, { error: "Introuvable" });
      const e = s.employees.find((x) => x.id === empId);
      if (method === "PATCH") {
        if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
        if (!e) return json(res, 404, { error: "Introuvable" });
        const body = await readBody(req);
        if (body.name !== undefined) e.name = body.name;
        if (body.ca !== undefined) e.ca = Number(body.ca) || 0;
        if (body.percent !== undefined) e.percent = body.percent === null || body.percent === "" ? null : Number(body.percent);
        if (body.prime !== undefined) e.prime = Number(body.prime) || 0;
        if (body.paid !== undefined) e.paid = !!body.paid;
        await writeCompanies(companies);
        return json(res, 200, e);
      }
      if (method === "DELETE") {
        if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
        s.employees = s.employees.filter((x) => x.id !== empId);
        await writeCompanies(companies);
        return json(res, 200, { ok: true });
      }
    }

    // /api/companies/:id/sheets/:sheetId/expenses
    if (segs.length === 6 && segs[5] === "expenses" && method === "POST") {
      const companyId = segs[2], sheetId = segs[4];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const { s } = findSheet(companies, companyId, sheetId);
      if (!s) return json(res, 404, { error: "Introuvable" });
      if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
      const d = { id: uid(), reason: "", amount: 0 };
      s.expenses.push(d);
      await writeCompanies(companies);
      return json(res, 200, d);
    }

    // /api/companies/:id/sheets/:sheetId/expenses/:expId
    if (segs.length === 7 && segs[5] === "expenses") {
      const companyId = segs[2], sheetId = segs[4], expId = segs[6];
      if (!canAccessCompany(companyId)) return json(res, 403, { error: "Acces refuse" });
      const { s } = findSheet(companies, companyId, sheetId);
      if (!s) return json(res, 404, { error: "Introuvable" });
      const d = s.expenses.find((x) => x.id === expId);
      if (method === "PATCH") {
        if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
        if (!d) return json(res, 404, { error: "Introuvable" });
        const body = await readBody(req);
        if (body.reason !== undefined) d.reason = body.reason;
        if (body.amount !== undefined) d.amount = Number(body.amount) || 0;
        await writeCompanies(companies);
        return json(res, 200, d);
      }
      if (method === "DELETE") {
        if (s.locked) return json(res, 423, { error: "Fiche verrouillee" });
        s.expenses = s.expenses.filter((x) => x.id !== expId);
        await writeCompanies(companies);
        return json(res, 200, { ok: true });
      }
    }

    return json(res, 404, { error: "Route introuvable" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Erreur serveur: " + err.message });
  }
};
