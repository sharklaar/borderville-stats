// scripts/fetchAirtable.js
const AIRTABLE_API = "https://api.airtable.com/v0";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllRecords({ baseId, tableId, token, pageSize = 100 }) {
  const records = [];
  let offset;

  while (true) {
    const url = new URL(`${AIRTABLE_API}/${baseId}/${tableId}`);
    url.searchParams.set("pageSize", String(pageSize));
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (Array.isArray(json.records)) {
      records.push(...json.records);
    }

    if (!json.offset) break;
    offset = json.offset;

    await sleep(120); // be polite to Airtable
  }

  return records;
}

function getConfig() {
  return {
    token: requireEnv("AIRTABLE_TOKEN"),
    baseId: requireEnv("AIRTABLE_BASE_ID"),
  };
}

module.exports = {
  fetchAllRecords,
  getConfig,
};
