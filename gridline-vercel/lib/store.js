const { kv } = require("@vercel/kv");

const SEED_COMPANIES = [
  {
    id: "c1",
    name: "Bennys Motorworks",
    defaultPercent: 15,
    coffre: 250000,
    discordRoleId: "",
    sheets: [
      {
        id: "s1",
        dateDebut: "2026-08-24",
        dateFin: "2026-08-30",
        locked: false,
        employees: [
          { id: "e1", name: "J. Duval", ca: 42000, percent: null, prime: 500, paid: false },
          { id: "e2", name: "M. Costa", ca: 28500, percent: 18, prime: 0, paid: false },
        ],
        expenses: [{ id: "d1", reason: "Achat pieces detachees", amount: 12000 }],
      },
    ],
  },
];

const SEED_CONFIG = { adminRoleId: "" };

async function readCompanies() {
  const data = await kv.get("companies");
  if (!data) {
    await kv.set("companies", SEED_COMPANIES);
    return SEED_COMPANIES;
  }
  return data;
}

async function writeCompanies(data) {
  await kv.set("companies", data);
}

async function readConfig() {
  const data = await kv.get("config");
  if (!data) {
    await kv.set("config", SEED_CONFIG);
    return SEED_CONFIG;
  }
  return data;
}

async function writeConfig(data) {
  await kv.set("config", data);
}

module.exports = { readCompanies, writeCompanies, readConfig, writeConfig };
