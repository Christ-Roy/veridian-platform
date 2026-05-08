/**
 * Prod smoke — bloquant en CI prod (post-deploy).
 *
 * Ce spec attrape le genre de bugs qui sont passés en prod le 2026-05-08 :
 *  - /login charge mais le bundle JS appelle un Supabase down (500)
 *  - middleware Auth.js qui crash avec AuthUnknownError sur tokens
 *  - container démarre OK mais /api/health échoue car DB inaccessible
 *
 * Pas besoin de creds : on teste uniquement le flow public + erreurs réseau.
 * Si ce spec passe, ça veut dire au minimum que :
 *  - /api/health répond 200 + db:ok
 *  - /api/status répond 200 + counts
 *  - /login render correctement (form présent)
 *  - le POST de login déclenche un appel auth qui répond (pas un 5xx réseau)
 *  - aucune erreur console critique au load
 *
 * Si une de ces vérifs fail, le deploy est rollback automatiquement.
 */
import { test, expect, type ConsoleMessage } from "@playwright/test";

const PROSPECTION_URL =
  process.env.PROSPECTION_URL || "https://prospection.app.veridian.site";

test.describe("Prod smoke (post-deploy gate)", () => {
  test.setTimeout(60_000);

  test("/api/health → 200 + db:ok", async ({ request }) => {
    const res = await request.get(`${PROSPECTION_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toMatch(/^(ok|healthy)$/);
    expect(body.db).toBe("ok");
    if (typeof body.leadCount === "number") {
      expect(body.leadCount).toBeGreaterThan(100_000);
    }
  });

  test("/api/status → 200 et expose la version", async ({ request }) => {
    const res = await request.get(`${PROSPECTION_URL}/api/status`);
    expect(res.status()).toBeLessThan(500);
  });

  test("/login charge le formulaire et n'a pas d'erreur 5xx réseau", async ({ page }) => {
    const errors: string[] = [];
    const fiveXX: string[] = [];

    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() !== "error") return;
      const t = msg.text();
      // Ignore les bruits navigateur
      if (t.includes("favicon") || t.includes("chrome-extension://")) return;
      if (t.includes("GTM") || t.includes("dataLayer")) return;
      // 401/403 sur des endpoints protégés sont attendus tant qu'on n'est pas loggé
      if (t.includes("status of 401") || t.includes("status of 403")) return;
      errors.push(t);
    });

    page.on("response", (res) => {
      if (res.status() >= 500) {
        fiveXX.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(`${PROSPECTION_URL}/login`, { waitUntil: "networkidle" });

    // Form bien là
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Rien de cassé en réseau ou en console
    expect(fiveXX, `5xx reçus: ${fiveXX.join(", ")}`).toHaveLength(0);
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("POST login avec creds bidons → 'Email ou mot de passe incorrect' (auth backend OK)", async ({ page }) => {
    const fiveXX: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 500) fiveXX.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(`${PROSPECTION_URL}/login`);
    await page.locator("#email").fill("smoke-test-not-a-real-user@yopmail.com");
    await page.locator("#password").fill("WrongPasswordForSmoke");

    const t0 = Date.now();
    await page.locator('button[type="submit"]').click();

    // Le backend auth doit répondre proprement avec "Invalid login credentials"
    // que la page traduit en "Email ou mot de passe incorrect". Si on voit à la
    // place "Erreur de connexion" (= fetch a planté) ou "indisponible"
    // (= NEXT_PUBLIC_SUPABASE_URL pas dans le bundle), c'est que le backend
    // auth est down ou mal configuré → ce test fail.
    const errorMessage = page.locator('div.bg-red-50, div.bg-amber-50');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10_000 });

    const errorText = (await errorMessage.first().textContent()) || "";
    expect(
      errorText,
      `Le message d'erreur indique un problème backend auth, pas un mauvais mdp: "${errorText}"`,
    ).toMatch(/incorrect|invalid|credentials/i);
    expect(
      errorText,
      `Le message d'erreur affiché trahit un backend down: "${errorText}"`,
    ).not.toMatch(/erreur de connexion|indisponible|fetch|network/i);

    const duration = Date.now() - t0;
    expect(duration, `Le flow auth est trop lent (${duration}ms)`).toBeLessThan(10_000);

    expect(fiveXX, `Le flow login a renvoyé un 5xx: ${fiveXX.join(", ")}`).toHaveLength(0);
    expect(page.url()).toContain("/login");
  });
});
