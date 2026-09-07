const { useState, useEffect, useMemo, useCallback } = React;

const CATEGORIES = [
  "SAFD",
  "SAPD",
  "Restauration",
  "Commerces",
  "Entreprises Privées",
  "Farm Nord",
  "Farm Sud",
  "Événementiels",
  "Concessions",
  "Garages",
];

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + " $";

const SALAIRE_MAX = 10000000;

// ---------- Helper API ----------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return res.json();
}

// ---------- Champ texte/numérique qui ne perd jamais le curseur ----------
// Gère sa propre valeur locale pendant la frappe, et ne remonte l'info au
// parent (et au serveur) qu'au blur / touche Entrée. Le parent ne re-rend
// donc pas ce champ à chaque caractère tapé -> plus de saut de curseur.
function Field({ value, onCommit, type = "text", disabled, placeholder, style }) {
  const [local, setLocal] = useState(value === null || value === undefined ? "" : String(value));

  useEffect(() => {
    setLocal(value === null || value === undefined ? "" : String(value));
  }, [value]);

  const commit = () => {
    const current = value === null || value === undefined ? "" : String(value);
    if (local !== current) onCommit(local);
  };

  return (
    <input
      className="gx-input"
      style={style}
      type={type === "number" ? "text" : type}
      inputMode={type === "number" ? "decimal" : undefined}
      disabled={disabled}
      placeholder={placeholder}
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        if (type === "number") {
          // n'autorise que chiffres, point et signe moins en tête
          if (v === "" || /^-?\d*\.?\d*$/.test(v)) setLocal(v);
        } else {
          setLocal(v);
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

// ---------- Ecran de connexion ----------
function LoginScreen() {
  return (
    <div className="gx-login-wrap">
      <div className="gx-login-card">
        <img src="/logo.png" alt="Gridline" />
        <div style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
          Gridline <span style={{ color: "var(--neon-soft)" }}>| Légal</span>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Connecte-toi avec Discord pour accéder à ton espace.
        </div>
        <a className="gx-discord-btn" href="/auth/discord">
          Se connecter avec Discord
        </a>
      </div>
    </div>
  );
}

// ---------- Ecran accès refusé ----------
function DeniedScreen({ username, onLogout }) {
  return (
    <div className="gx-denied">
      <div style={{ fontFamily: "var(--sans)", fontSize: 16, fontWeight: 600 }}>
        Accès refusé
      </div>
      <div style={{ fontSize: 13, maxWidth: 380, textAlign: "center" }}>
        Connecté en tant que <b>{username}</b>, mais aucun rôle Discord ne te donne accès à un
        espace entreprise ou à l'administration. Demande à un admin de lier ton rôle à une
        entreprise.
      </div>
      <button className="gx-btn" onClick={onLogout} style={{ marginTop: 8 }}>
        Se déconnecter
      </button>
    </div>
  );
}

// ---------- Bandeau d'initialisation (bootstrap) ----------
function BootstrapBanner({ onSaved }) {
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!roleId.trim()) return;
    setSaving(true);
    try {
      await api("PUT", "/api/config", { adminRoleId: roleId.trim() });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gx-bootstrap-banner">
      <div style={{ marginBottom: 8 }}>
        <b>Initialisation :</b> aucun rôle admin n'est encore configuré. Tant que ce n'est pas
        fait, tout le monde qui se connecte a un accès admin temporaire. Colle ici l'ID du rôle
        Discord qui doit avoir les droits admin, puis enregistre.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="gx-input"
          style={{ maxWidth: 260 }}
          placeholder="ID du rôle Discord admin"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        />
        <button className="gx-btn gx-btn-primary" disabled={saving} onClick={save}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ---------- Réglages (admin) ----------
function SettingsView({ isOwner }) {
  const [adminRoleIds, setAdminRoleIds] = useState([]);
  const [newRoleId, setNewRoleId] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => api("GET", "/api/config").then((c) => setAdminRoleIds(c.adminRoleIds || []));

  useEffect(() => {
    load();
  }, []);

  const addRole = async () => {
    if (!newRoleId.trim()) return;
    const c = await api("PUT", "/api/config", { addRoleId: newRoleId.trim() });
    setAdminRoleIds(c.adminRoleIds || []);
    setNewRoleId("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const removeRole = async (roleId) => {
    const c = await api("PUT", "/api/config", { removeRoleId: roleId });
    setAdminRoleIds(c.adminRoleIds || []);
  };

  return (
    <>
      <h2 style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>
        Réglages Discord
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
        ID du serveur Discord relié : <code style={{ fontFamily: "var(--mono)" }}>1418719996665921546</code>
      </p>
      <div className="gx-card" style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          Rôles Discord donnant les droits admin (accès total : vue d'ensemble + toutes les
          entreprises). Plusieurs rôles peuvent être ajoutés.
        </div>

        {adminRoleIds.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Aucun rôle admin configuré.</div>
        )}
        {adminRoleIds.map((id) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{id}</code>
            {isOwner && (
              <span className="gx-link" onClick={() => removeRole(id)}>Retirer</span>
            )}
          </div>
        ))}

        {isOwner ? (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input
              className="gx-input"
              placeholder="ID du rôle Discord à ajouter"
              value={newRoleId}
              onChange={(e) => setNewRoleId(e.target.value)}
            />
            <button className="gx-btn gx-btn-primary" onClick={addRole}>
              Ajouter
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14 }}>
            Seul le propriétaire du site peut ajouter ou retirer des rôles admin.
          </div>
        )}

        {saved && <div style={{ color: "var(--green)", fontSize: 12, marginTop: 8 }}>Enregistré ✓</div>}
        <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 12 }}>
          Le rôle Discord de chaque entreprise se règle directement depuis la page de
          l'entreprise (champ "Rôle Discord lié").
        </div>
      </div>
    </>
  );
}

// ---------- Vue d'ensemble (admin) ----------
function AdminView({ companies, isOwner, onOpenCompany, onAddCompany, onRemoveCompany }) {
  const companyTotals = (c) => {
    let salaires = 0, depenses = 0, ca = 0;
    c.sheets.forEach((s) => {
      s.employees.forEach((e) => {
        const pct = e.percent ?? c.defaultPercent;
        const brut = (e.ca || 0) * (pct / 100) + (e.prime || 0);
        salaires += Math.min(brut, SALAIRE_MAX);
        ca += e.ca || 0;
      });
      depenses += s.expenses.reduce((sum, d) => sum + (d.amount || 0), 0);
    });
    return { ca, salaires, depenses, totalGeneral: salaires + depenses };
  };

  const grand = useMemo(() => {
    let ca = 0, salaires = 0, depenses = 0, coffre = 0;
    companies.forEach((c) => {
      const t = companyTotals(c);
      ca += t.ca;
      salaires += t.salaires;
      depenses += t.depenses;
      coffre += c.coffre || 0;
    });
    return { ca, salaires, depenses, totalGeneral: salaires + depenses, coffre };
  }, [companies]);

  return (
    <>
      <h2 style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 18, margin: "0 0 4px" }}>
        Vue d'ensemble — toutes entreprises
      </h2>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
        Cumul de toutes les fiches de paie enregistrées, toutes semaines confondues.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
        {[
          ["Coffres cumulés", grand.coffre, "var(--text)"],
          ["Salaires versés (total)", grand.salaires, "var(--text)"],
          ["Dépenses autres (total)", grand.depenses, "var(--red)"],
          ["Total dépensé", grand.totalGeneral, "var(--neon-soft)"],
        ].map(([label, val, color]) => (
          <div key={label} className="gx-card gx-card-glow">
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 18, color }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Entreprises
        </div>
        <button className="gx-btn gx-btn-primary" onClick={onAddCompany}>
          + Ajouter une entreprise
        </button>
      </div>

      <table className="gx-table">
        <thead>
          <tr>
            {["Entreprise", "Coffre", "% défaut", "Rôle Discord", "Fiches", "Salaires", "Dépenses", "Total", ""].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            const t = companyTotals(c);
            return (
              <tr key={c.id}>
                <td>
                  <span style={{ cursor: "pointer", color: "var(--neon-soft)" }} onClick={() => onOpenCompany(c.id)}>
                    {c.name}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--mono)" }}>{fmt(c.coffre)}</td>
                <td style={{ fontFamily: "var(--mono)" }}>{c.defaultPercent}%</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--muted)" }}>
                  {c.discordRoleId || "—"}
                </td>
                <td style={{ fontFamily: "var(--mono)" }}>{c.sheets.length}</td>
                <td style={{ fontFamily: "var(--mono)" }}>{fmt(t.salaires)}</td>
                <td style={{ fontFamily: "var(--mono)", color: "var(--red)" }}>{fmt(t.depenses)}</td>
                <td style={{ fontFamily: "var(--mono)", color: "var(--neon-soft)" }}>{fmt(t.totalGeneral)}</td>
                <td>
                  {isOwner && (
                    <span className="gx-link" onClick={() => onRemoveCompany(c.id)}>
                      Supprimer
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ---------- Vue entreprise ----------
function CompanyView({ company, isAdmin, isOwner, refresh, onRemoveCompany }) {
  const [sheetIdx, setSheetIdx] = useState(company.sheets.length - 1);
  useEffect(() => {
    setSheetIdx(company.sheets.length - 1);
  }, [company.id]);

  const sheet = company.sheets[sheetIdx];

  const calcSalaire = (emp) => {
    const pct = emp.percent ?? company.defaultPercent;
    const brut = (emp.ca || 0) * (pct / 100) + (emp.prime || 0);
    return { pct, salaire: Math.min(brut, SALAIRE_MAX), plafonne: brut > SALAIRE_MAX };
  };

  const totals = useMemo(() => {
    if (!sheet) return { salaires: 0, depenses: 0, totalGeneral: 0, caTotal: 0 };
    let salaires = 0;
    let caTotal = 0;
    sheet.employees.forEach((e) => {
      salaires += calcSalaire(e).salaire;
      caTotal += e.ca || 0;
    });
    const depenses = sheet.expenses.reduce((s, d) => s + (d.amount || 0), 0);
    return { salaires, depenses, totalGeneral: salaires + depenses, caTotal };
  }, [sheet, company.defaultPercent]);

  const locked = sheet ? !!sheet.locked : false;

  const patchCompany = (patch) => api("PATCH", `/api/companies/${company.id}`, patch).then(refresh);
  const addSheet = () => api("POST", `/api/companies/${company.id}/sheets`).then(refresh);
  const toggleLock = () =>
    api("PATCH", `/api/companies/${company.id}/sheets/${sheet.id}/lock`, { locked: !locked }).then(refresh);
  const patchSheet = (patch) =>
    api("PATCH", `/api/companies/${company.id}/sheets/${sheet.id}`, patch).then(refresh);

  const addEmployee = () =>
    api("POST", `/api/companies/${company.id}/sheets/${sheet.id}/employees`).then(refresh);
  const patchEmployee = (empId, patch) =>
    api("PATCH", `/api/companies/${company.id}/sheets/${sheet.id}/employees/${empId}`, patch).then(refresh);
  const removeEmployee = (empId) =>
    api("DELETE", `/api/companies/${company.id}/sheets/${sheet.id}/employees/${empId}`).then(refresh);

  const addExpense = () =>
    api("POST", `/api/companies/${company.id}/sheets/${sheet.id}/expenses`).then(refresh);
  const patchExpense = (expId, patch) =>
    api("PATCH", `/api/companies/${company.id}/sheets/${sheet.id}/expenses/${expId}`, patch).then(refresh);
  const removeExpense = (expId) =>
    api("DELETE", `/api/companies/${company.id}/sheets/${sheet.id}/expenses/${expId}`).then(refresh);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          {isAdmin ? (
            <Field
              value={company.name}
              onCommit={(v) => patchCompany({ name: v })}
              style={{ fontFamily: "var(--sans)", fontSize: 18, fontWeight: 600, border: "none", background: "transparent", padding: "0 0 4px", width: 320 }}
            />
          ) : (
            <div style={{ fontFamily: "var(--sans)", fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              {company.name}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
            {isAdmin && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Catégorie
                <select
                  className="gx-input"
                  style={{ width: 190 }}
                  value={CATEGORIES.includes(company.category) ? company.category : ""}
                  onChange={(e) => patchCompany({ category: e.target.value })}
                >
                  <option value="">Aucune (Autres)</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Commission par défaut
              <Field type="number" value={company.defaultPercent} disabled={!isAdmin} onCommit={(v) => patchCompany({ defaultPercent: Number(v) || 0 })} style={{ width: 60 }} />
              %
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Total du coffre
              <Field type="number" value={company.coffre} disabled={!isAdmin} onCommit={(v) => patchCompany({ coffre: Number(v) || 0 })} style={{ width: 120 }} />
              $
            </span>
            {isAdmin && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Rôle Discord lié (accès patron)
                <Field
                  value={company.discordRoleId}
                  placeholder="ID du rôle Discord"
                  onCommit={(v) => patchCompany({ discordRoleId: v })}
                  style={{ width: 170 }}
                />
              </span>
            )}
          </div>
        </div>
        {isOwner && (
          <button className="gx-btn gx-btn-danger" onClick={() => onRemoveCompany(company.id)}>
            Supprimer l'entreprise
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Fiches de paie
        </span>
        {company.sheets.map((s, i) => (
          <div
            key={s.id}
            onClick={() => setSheetIdx(i)}
            className={`gx-pill ${i === sheetIdx ? "active" : ""}`}
          >
            {s.dateDebut} → {s.dateFin}
            {s.locked && <span style={{ color: "var(--red)" }}>🔒</span>}
          </div>
        ))}
        <button className="gx-btn" onClick={addSheet}>+ Nouvelle fiche (semaine)</button>
      </div>

      {sheet && (
        <>
          <div className="gx-card" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Semaine du</span>
            <Field type="date" value={sheet.dateDebut} disabled={locked} onCommit={(v) => patchSheet({ dateDebut: v })} style={{ width: 150 }} />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>au</span>
            <Field type="date" value={sheet.dateFin} disabled={locked} onCommit={(v) => patchSheet({ dateFin: v })} style={{ width: 150 }} />

            <span className={`gx-lock-badge ${locked ? "locked" : "unlocked"}`}>
              {locked ? "🔒 Verrouillée" : "🔓 Modifiable"}
            </span>

            {isAdmin && (
              <button className="gx-btn" style={{ marginLeft: "auto" }} onClick={toggleLock}>
                {locked ? "Déverrouiller" : "Verrouiller"} la fiche
              </button>
            )}
            {!isAdmin && locked && (
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginLeft: "auto" }}>
                Seul un admin peut déverrouiller cette fiche.
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {isAdmin && (
              <div className="gx-card gx-card-glow">
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  CA total de l'entreprise (auto)
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--neon-soft)" }}>{fmt(totals.caTotal)}</div>
              </div>
            )}
            <div className="gx-card">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Salaires de la semaine</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20 }}>{fmt(totals.salaires)}</div>
            </div>
            <div className="gx-card">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Dépenses autres</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--red)" }}>{fmt(totals.depenses)}</div>
            </div>
            <div className="gx-card">
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Total dépensé</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--neon-soft)" }}>{fmt(totals.totalGeneral)}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Employés
          </div>
          <table className="gx-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                {["Employé", "CA personnel", "% (si différent)", "Prime", "Salaire calculé", "Payé", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.employees.map((e) => {
                const { pct, salaire, plafonne } = calcSalaire(e);
                return (
                  <tr key={e.id} style={e.paid ? { opacity: 0.55 } : undefined}>
                    <td><Field value={e.name} disabled={locked} onCommit={(v) => patchEmployee(e.id, { name: v })} /></td>
                    <td><Field type="number" value={e.ca} disabled={locked} onCommit={(v) => patchEmployee(e.id, { ca: Number(v) || 0 })} /></td>
                    <td>
                      <Field
                        type="number"
                        value={e.percent ?? ""}
                        placeholder={String(company.defaultPercent)}
                        disabled={locked}
                        onCommit={(v) => patchEmployee(e.id, { percent: v === "" ? null : Number(v) })}
                      />
                    </td>
                    <td><Field type="number" value={e.prime} disabled={locked} onCommit={(v) => patchEmployee(e.id, { prime: Number(v) || 0 })} /></td>
                    <td style={{ fontFamily: "var(--mono)", color: "var(--neon-soft)", whiteSpace: "nowrap" }}>
                      {fmt(salaire)} <span style={{ color: "var(--muted)", fontSize: 11 }}>({pct}%)</span>
                      {plafonne && <div style={{ color: "var(--red)", fontSize: 10.5 }}>Plafond 10M atteint</div>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="gx-checkbox"
                        checked={!!e.paid}
                        disabled={locked}
                        onChange={(ev) => patchEmployee(e.id, { paid: ev.target.checked })}
                      />
                    </td>
                    <td>
                      {!locked && (
                        <span className="gx-link" onClick={() => removeEmployee(e.id)}>Retirer</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="gx-btn" disabled={locked} onClick={addEmployee}>+ Ajouter un employé</button>

          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "24px 0 8px" }}>
            Dépenses autres
          </div>
          <table className="gx-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                {["Raison", "Montant", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.expenses.map((d) => (
                <tr key={d.id}>
                  <td><Field value={d.reason} placeholder="Ex. achat de matériel" disabled={locked} onCommit={(v) => patchExpense(d.id, { reason: v })} /></td>
                  <td style={{ width: 160 }}><Field type="number" value={d.amount} disabled={locked} onCommit={(v) => patchExpense(d.id, { amount: Number(v) || 0 })} /></td>
                  <td>
                    {!locked && <span className="gx-link" onClick={() => removeExpense(d.id)}>Retirer</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="gx-btn" disabled={locked} onClick={addExpense}>+ Ajouter une dépense</button>
        </>
      )}
    </>
  );
}

// ---------- App principale ----------
function App() {
  const [session, setSession] = useState(undefined); // undefined = chargement
  const [companies, setCompanies] = useState([]);
  const [view, setView] = useState("company"); // "admin" | "settings" | "company"
  const [activeId, setActiveId] = useState(null);

  const loadSession = useCallback(() => {
    api("GET", "/api/session").then(setSession);
  }, []);

  const loadCompanies = useCallback(() => {
    api("GET", "/api/companies")
      .then((cs) => {
        setCompanies(cs);
        setActiveId((prev) => prev || (cs[0] && cs[0].id));
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (session && session.loggedIn && (session.isAdmin || session.patronCompanyIds.length > 0)) {
      loadCompanies();
      if (!session.isAdmin) setView("company");
    }
  }, [session]);

  if (session === undefined) {
    return <div className="gx-app" />;
  }

  if (!session.loggedIn) {
    return (
      <div className="gx-app">
        <TopHeader session={session} />
        <LoginScreen />
      </div>
    );
  }

  const hasAccess = session.isAdmin || session.patronCompanyIds.length > 0;

  if (!hasAccess) {
    return (
      <div className="gx-app">
        <TopHeader session={session} />
        <DeniedScreen username={session.user.username} onLogout={() => (window.location.href = "/auth/logout")} />
      </div>
    );
  }

  const active = companies.find((c) => c.id === activeId) || companies[0];

  const addCompany = () => api("POST", "/api/companies").then(() => loadCompanies());
  const removeCompany = (id) => {
    if (!window.confirm("Supprimer définitivement cette entreprise ?")) return;
    api("DELETE", `/api/companies/${id}`).then(() => {
      loadCompanies();
      setView("admin");
    });
  };

  return (
    <div className="gx-app">
      <TopHeader session={session} />
      {session.bootstrap && session.isAdmin && (
        <div style={{ padding: "0 26px" }}>
          <BootstrapBanner onSaved={loadSession} />
        </div>
      )}
      <div className="gx-body">
        <div className="gx-sidebar">
          {session.isAdmin && (
            <>
              <div
                className={`gx-nav-item ${view === "admin" ? "active" : ""}`}
                onClick={() => setView("admin")}
              >
                Vue d'ensemble
              </div>
              <div
                className={`gx-nav-item ${view === "settings" ? "active" : ""}`}
                onClick={() => setView("settings")}
              >
                Réglages Discord
              </div>
            </>
          )}
          {(() => {
            const grouped = {};
            CATEGORIES.forEach((cat) => (grouped[cat] = []));
            grouped["Autres"] = [];
            companies.forEach((c) => {
              const cat = CATEGORIES.includes(c.category) ? c.category : "Autres";
              grouped[cat].push(c);
            });
            const catList = [...CATEGORIES, "Autres"];
            return catList.map((cat) => {
              if (grouped[cat].length === 0) return null;
              return (
                <div key={cat}>
                  <div className="gx-nav-section">{cat}</div>
                  {grouped[cat].map((c) => (
                    <div
                      key={c.id}
                      className={`gx-nav-item ${view === "company" && activeId === c.id ? "active" : ""}`}
                      onClick={() => {
                        setActiveId(c.id);
                        setView("company");
                      }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              );
            });
          })()}
          {companies.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Aucune entreprise accessible.</div>
          )}
        </div>

        <div className="gx-main">
          {view === "admin" && session.isAdmin && (
            <AdminView
              companies={companies}
              isOwner={session.isOwner}
              onOpenCompany={(id) => { setActiveId(id); setView("company"); }}
              onAddCompany={addCompany}
              onRemoveCompany={removeCompany}
            />
          )}
          {view === "settings" && session.isAdmin && <SettingsView isOwner={session.isOwner} />}
          {view === "company" && active && (
            <CompanyView
              key={active.id}
              company={active}
              isAdmin={session.isAdmin}
              isOwner={session.isOwner}
              refresh={loadCompanies}
              onRemoveCompany={removeCompany}
            />
          )}
          {view === "company" && !active && (
            <div style={{ color: "var(--muted)" }}>Aucune entreprise sélectionnée.</div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <div className="gx-footer">
      𝐷𝑒𝑣𝑒𝑙𝑜𝑝𝑒𝑑 𝑏𝑦 𝑁𝑜𝑡𝐹𝑜𝑢𝑛𝑑 / 𝑉𝑖𝑜𝑙𝑒𝑛𝑐𝑒 .14𝑘 &amp; Lunik3G — .gg/GridLine
    </div>
  );
}

function TopHeader({ session }) {
  return (
    <div className="gx-header">
      <div className="gx-header-left">
        <img className="gx-logo" src="/logo.png" alt="Gridline" />
        <div className="gx-title">Comptabilité</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div className="gx-header-right">
          Gridline<span className="gx-sep">|</span>Légal
        </div>
        {session && session.loggedIn && (
          <div className="gx-user">
            {session.user.avatar && (
              <img
                src={`https://cdn.discordapp.com/avatars/${session.user.id}/${session.user.avatar}.png`}
                alt=""
              />
            )}
            <span>{session.user.username}</span>
            <a className="gx-link" href="/auth/logout">Déconnexion</a>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
