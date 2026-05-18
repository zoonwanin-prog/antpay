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
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      })
  );
}

const parsed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const env = readEnv(".env.local");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const result = {};

for (const [table, rows] of Object.entries(parsed)) {
  const keys = rows.map((row) => row.import_key);
  let count = 0;
  for (let index = 0; index < keys.length; index += 100) {
    const { data, error } = await supabase.from(table).select("import_key").in("import_key", keys.slice(index, index + 100));
    if (error) throw new Error(`${table}: ${error.message}`);
    count += data?.length || 0;
  }
  result[table] = { expected: rows.length, found: count };
}

console.log(JSON.stringify(result, null, 2));
