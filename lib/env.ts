export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export const appConfig = {
  timezone: "Asia/Bangkok",
  go2payApiBase: optionalEnv("GO2PAY_API_BASE", "https://api.go2pay.tech/api/admin"),
  statementsTable: optionalEnv("SUPABASE_STATEMENTS_TABLE", "statements"),
  statementsDateColumn: optionalEnv("SUPABASE_STATEMENTS_DATE_COLUMN", "transaction_date"),
  statementsAccountColumn: optionalEnv("SUPABASE_STATEMENTS_ACCOUNT_COLUMN", "account_no")
};
