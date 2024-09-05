export type Environment = "staging" | "production" | "review" | "development";

export const environmentFromEnv = (): Environment => {
  const env = Deno.env.get("ENVIRONMENT")?.toLowerCase().trim();
  if (env == "staging") return "staging";
  else if (env == "production") return "production";
  else if (env?.startsWith("review")) return "review";
  else return "development";
};
