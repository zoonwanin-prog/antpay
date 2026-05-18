import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv(path) {
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        const value = line.slice(index + 1).replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

function chunks(rows, size) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: node scripts/import-go2paybo-json.mjs parsed.json");
  process.exit(1);
}

const env = readEnv(".env.local");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const summary = {};

for (const [table, rows] of Object.entries(parsed)) {
  let insertedOrExisting = 0;
  for (const batch of chunks(rows, 200)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: "import_key", ignoreDuplicates: true })
      .select("id,import_key");
    if (error) throw new Error(`${table}: ${error.message}`);
    insertedOrExisting += data?.length || 0;
  }
  summary[table] = { sourceRows: rows.length, returnedRows: insertedOrExisting };
}

console.log(JSON.stringify(summary, null, 2));
