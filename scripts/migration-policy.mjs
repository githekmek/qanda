export function migrationPolicy(env) {
  const vercelEnvironment = env.VERCEL_ENV;

  if (!env.VERCEL) {
    return { run: true, message: "Migration für lokale oder CI-Umgebung." };
  }

  if (vercelEnvironment === "production") {
    return { run: true, message: "Migration für Produktionsumgebung." };
  }

  if (vercelEnvironment !== "preview") {
    return {
      run: false,
      message: `Keine automatische Migration für Vercel-Umgebung "${vercelEnvironment ?? "unbekannt"}".`,
    };
  }

  if (env.RUN_PREVIEW_MIGRATIONS !== "true") {
    return {
      run: false,
      message: "Preview-Migration übersprungen: RUN_PREVIEW_MIGRATIONS ist nicht ausdrücklich auf true gesetzt.",
    };
  }

  if (!env.DATABASE_URL) {
    throw new Error(
      "Preview-Migration freigegeben, aber DATABASE_URL fehlt. Es wurde keine Migration ausgeführt."
    );
  }

  return {
    run: true,
    message: "Preview-Migration ausdrücklich freigegeben; verwende die für Preview gesetzte DATABASE_URL.",
  };
}
