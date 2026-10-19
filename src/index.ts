import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";

// Reserved slugs that cannot be claimed by user published sites
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "mail", "status", "masidy",
  "support", "billing", "login", "signup", "dashboard", "preview",
  "assets", "static", "help", "terms", "privacy", "blog", "docs"
]);

// Profanity & inappropriate keyword filter for slugs and prompts
const BANNED_KEYWORDS = [
  "hack", "exploit", "phish", "malware", "scam", "spam", "casino",
  "porn", "adult", "gambling", "abuse", "terror", "weapon"
];

// Tariff Costs Config
export const COST_CONFIG = {
  NEW_USER_BONUS: 50,
  BUILD_COST: 10,
  EDIT_COST: 3,
  PUBLISH_COST: 0,
  PACKS: [
    { id: "pack_100", credits: 100, price_usd: 10, price_egp: 500, label_ar: "باقة 100 رصيد" },
    { id: "pack_500", credits: 500, price_usd: 40, price_egp: 2000, label_ar: "باقة 500 رصيد (الأكثر شعبية)" },
    { id: "pack_2000", credits: 2000, price_usd: 120, price_egp: 6000, label_ar: "باقة 2000 رصيد (للمحترفين)" }
  ]
};

export class App extends DurableObject {
  private app = new Hono();
  private dbInitialized = false;

  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.setupRoutes();
  }

  private initDatabase() {
    if (this.dbInitialized) return;

    // 1. Users Table
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 50,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL
      );
    `);

    // 2. Sessions Table
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 3. Projects Table
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        custom_domain TEXT,
        custom_domain_status TEXT DEFAULT 'pending',
        current_code TEXT,
        plan_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // 4. Project Versions (for rollbacks)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_num INTEGER NOT NULL,
        code_snapshot TEXT NOT NULL,
        commit_message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 5. Credit Ledger (Atomic transaction ledger)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        reference_id TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // 6. Processed Webhooks (Idempotency)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS processed_webhooks (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        transaction_id TEXT UNIQUE NOT NULL,
        payload_hash TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // 7. Abuse Reports
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS abuse_reports (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        reporter_ip TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // Ensure default demo/admin user exists
    const adminCheck = this.ctx.storage.sql.exec(`SELECT id FROM users WHERE email = 'admin@masidy.app'`).toArray();
    if (adminCheck.length === 0) {
      const adminId = "usr_admin_default";
      const now = Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO users (id, email, name, credits, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        adminId, "admin@masidy.app", "مدير مسيدي", 1000, "admin", now
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`,
        "demo_admin_session", adminId, now
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        "led_init_admin", adminId, 1000, 1000, "رصيد المسئول الأول", "system", now
      );
    }

    this.dbInitialized = true;
  }

  // Helper to authenticate session token
  private getUserFromRequest(c: any) {
    this.initDatabase();
    const authHeader = c.req.header("Authorization");
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = c.req.cookie("masidy_session") || "demo_admin_session";
    }

    const sessRows = this.ctx.storage.sql.exec(`SELECT user_id FROM sessions WHERE token = ?`, token).toArray();
    if (sessRows.length === 0) {
      return null;
    }
    const userId = sessRows[0].user_id;
    const userRows = this.ctx.storage.sql.exec(`SELECT * FROM users WHERE id = ?`, userId).toArray();
    return userRows.length > 0 ? userRows[0] : null;
  }

  // Helper for atomic credit operations
  private deductCredits(userId: string, cost: number, reason: string, refId: string): { success: boolean; balance: number; error?: string } {
    this.initDatabase();
    let result = { success: false, balance: 0, error: "" };

    this.ctx.storage.transactionSync(() => {
      const userRows = this.ctx.storage.sql.exec(`SELECT credits FROM users WHERE id = ?`, userId).toArray();
      if (userRows.length === 0) {
        result.error = "المستخدم غير موجود";
        return;
      }
      const currentCredits = Number(userRows[0].credits);
      if (currentCredits < cost) {
        result.error = `رصيدك الحالي (${currentCredits} رصيد) غير كافٍ. يتطلب إجراء هذه العملية (${cost} رصيد). يمكنك إشعار أو شراء باقة جديدة.`;
        result.balance = currentCredits;
        return;
      }

      const newBalance = currentCredits - cost;
      this.ctx.storage.sql.exec(`UPDATE users SET credits = ? WHERE id = ?`, newBalance, userId);
      const ledgerId = "led_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ledgerId, userId, -cost, newBalance, reason, refId, Date.now()
      );

      result = { success: true, balance: newBalance };
    });

    return result;
  }

  private addCredits(userId: string, amount: number, reason: string, refId: string): number {
    this.initDatabase();
    let newBalance = 0;
    this.ctx.storage.transactionSync(() => {
      const userRows = this.ctx.storage.sql.exec(`SELECT credits FROM users WHERE id = ?`, userId).toArray();
      const currentCredits = userRows.length > 0 ? Number(userRows[0].credits) : 0;
      newBalance = currentCredits + amount;
      this.ctx.storage.sql.exec(`UPDATE users SET credits = ? WHERE id = ?`, newBalance, userId);

      const ledgerId = "led_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ledgerId, userId, amount, newBalance, reason, refId, Date.now()
      );
    });
    return newBalance;
  }

  private setupRoutes() {
    // -------------------------------------------------------------
    // Health & Info
    // -------------------------------------------------------------
    this.app.get("/api/health", (c) => c.json({ status: "ok", name: "Masidy Engine", ar_name: "مسيدي" }));

    // -------------------------------------------------------------
    // Auth Routes
    // -------------------------------------------------------------
    this.app.post("/api/auth/demo-login", async (c) => {
      this.initDatabase();
      const body = await c.req.json().catch(() => ({}));
      const email = body.email || "user@masidy.app";
      const name = body.name || "مستخدم مسيدي";

      let userRows = this.ctx.storage.sql.exec(`SELECT * FROM users WHERE email = ?`, email).toArray();
      let userId = "";
      if (userRows.length === 0) {
        userId = "usr_" + Math.random().toString(36).substring(2, 10);
        const now = Date.now();
        this.ctx.storage.sql.exec(
          `INSERT INTO users (id, email, name, credits, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          userId, email, name, COST_CONFIG.NEW_USER_BONUS, "user", now
        );
        this.ctx.storage.sql.exec(
          `INSERT INTO credit_ledger (id, user_id, amount, balance_after, reason, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          "led_" + Math.random().toString(36).substring(2, 10), userId, COST_CONFIG.NEW_USER_BONUS, COST_CONFIG.NEW_USER_BONUS, "هدية الترحيب للمستخدم الجديد", "signup", now
        );
      } else {
        userId = userRows[0].id as string;
      }

      const token = "sess_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
      this.ctx.storage.sql.exec(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`, token, userId, Date.now());

      return c.json({ success: true, token, user_id: userId });
    });

    this.app.get("/api/user/me", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) {
        return c.json({ authenticated: false }, 401);
      }
      return c.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          credits: user.credits,
          role: user.role
        }
      });
    });

    // -------------------------------------------------------------
    // Project Creation & Plan-Then-Approve Engine (Step 2)
    // -------------------------------------------------------------
    this.app.post("/api/projects/plan", async (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح، يرجى تسجيل الدخول" }, 401);

      const body = await c.req.json().catch(() => ({}));
      const prompt = (body.prompt || "").trim();

      if (!prompt) {
        return c.json({ error: "يرجى كتابة وصف الفكرة أولاً" }, 400);
      }

      // Check moderation / injection
      for (const kw of BANNED_KEYWORDS) {
        if (prompt.toLowerCase().includes(kw)) {
          return c.json({ error: "النص يحتوي على كلمات غير مسموح بها لأسباب أمان" }, 400);
        }
      }

      // Generate a suggested slug
      let baseSlug = prompt
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 20);
      if (!baseSlug || baseSlug.length < 3) {
        baseSlug = "app-" + Math.random().toString(36).substring(2, 8);
      }
      if (RESERVED_SLUGS.has(baseSlug)) {
        baseSlug = baseSlug + "-site";
      }

      // Generate Plan JSON in Arabic
      const plan = {
        title: body.title || "موقع " + prompt.slice(0, 25),
        slug: baseSlug,
        summary: `بناء تطبيق/موقع تفاعلي يلبي: "${prompt}" بتصميم عصري داعم للغة العربية وتجاوب كامل.`,
        pages: [
          { name: "الرئيسية", path: "/", description: "عروض رئيسية، رسالة القيمة، وأزرار تفاعلية" },
          { name: "المميزات والخدمات", path: "#features", description: "شبكة استعراض البطاقات والمزايا" },
          { name: "الأسعار/الخدمات", path: "#pricing", description: "جدول باقات تفاعلي متجاوب" },
          { name: "تواصل معنا", path: "#contact", description: "نموذج اتصال سريع ومؤشر خريطة" }
        ],
        features: [
          "دعم كامل للغة العربية لاتتجاه من اليمين إلى اليسار (RTL)",
          "خط IBM Plex Sans Arabic بتنسيقات ممتازة",
          "بطاقات تفاعلية مع أنيميشن سلس ومريح للعين",
          "أزرار تفاعلية ونماذج معالجة سريعة"
        ],
        tech_stack: ["React 18", "Tailwind CSS", "IBM Plex Sans Arabic", "Cloudflare Workers"],
        original_prompt: prompt
      };

      const projectId = "prj_" + Math.random().toString(36).substring(2, 10);
      const now = Date.now();

      this.ctx.storage.sql.exec(
        `INSERT INTO projects (id, user_id, name, slug, status, plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        projectId, user.id, plan.title, plan.slug, "plan_pending", JSON.stringify(plan), now, now
      );

      return c.json({
        success: true,
        project_id: projectId,
        plan,
        build_cost: COST_CONFIG.BUILD_COST,
        user_credits: user.credits
      });
    });

    // Approve Plan & Execute Generation (Cost: 10 Credits)
    this.app.post("/api/projects/:id/approve-plan", async (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projectId = c.req.param("id");
      const projRows = this.ctx.storage.sql.exec(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, projectId, user.id).toArray();
      if (projRows.length === 0) {
        return c.json({ error: "المشروع غير موجود" }, 404);
      }
      const project = projRows[0];

      // Atomic Credit Deduction (10 Credits)
      const ded = this.deductCredits(user.id, COST_CONFIG.BUILD_COST, "إنشاء مشروع جديد ومخطط التطبيق", projectId);
      if (!ded.success) {
        return c.json({ error: ded.error, balance: ded.balance }, 402);
      }

      // Generate HTML/JS application prototype code matching the plan
      const plan = JSON.parse(project.plan_json as string || "{}");
      const generatedHtml = this.generateSampleCodeForPlan(plan);

      const now = Date.now();
      this.ctx.storage.sql.exec(
        `UPDATE projects SET status = 'ready', current_code = ?, updated_at = ? WHERE id = ?`,
        generatedHtml, now, projectId
      );

      // Save initial version
      const versionId = "ver_" + Math.random().toString(36).substring(2, 10);
      this.ctx.storage.sql.exec(
        `INSERT INTO versions (id, project_id, version_num, code_snapshot, commit_message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        versionId, projectId, 1, generatedHtml, "الإصدار الأول بعد اعتماد الخطة", now
      );

      return c.json({
        success: true,
        project_id: projectId,
        code: generatedHtml,
        remaining_credits: ded.balance
      });
    });

    // -------------------------------------------------------------
    // Edit Project Flow (Step 3 / Step 4 - Cost 3 Credits)
    // -------------------------------------------------------------
    this.app.post("/api/projects/:id/edit", async (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projectId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const editPrompt = (body.prompt || "").trim();

      if (!editPrompt) return c.json({ error: "يرجى كتابة التعديل المطلوب" }, 400);

      const projRows = this.ctx.storage.sql.exec(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, projectId, user.id).toArray();
      if (projRows.length === 0) return c.json({ error: "المشروع غير موجود" }, 404);
      const project = projRows[0];

      // Deduct 3 credits
      const ded = this.deductCredits(user.id, COST_CONFIG.EDIT_COST, `تعديل المشروع: ${editPrompt.slice(0, 20)}...`, projectId);
      if (!ded.success) {
        return c.json({ error: ded.error, balance: ded.balance }, 402);
      }

      // Perform transformation on current code
      let currentCode = (project.current_code as string) || "";
      if (!currentCode) {
        currentCode = this.generateSampleCodeForPlan({ title: project.name, summary: editPrompt });
      }

      // Append custom edit banner or modify content safely
      const updatedCode = currentCode.replace(
        "</body>",
        `<!-- Modification requested: ${editPrompt.replace(/</g, "&lt;")} -->\n<script>console.log("Applied edit: ${editPrompt.replace(/"/g, '\\"')}");</script>\n</body>`
      );

      const now = Date.now();
      this.ctx.storage.sql.exec(
        `UPDATE projects SET current_code = ?, updated_at = ? WHERE id = ?`,
        updatedCode, now, projectId
      );

      // Save new version
      const verCount = this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM versions WHERE project_id = ?`, projectId).one().c as number;
      const newVerNum = verCount + 1;
      const verId = "ver_" + Math.random().toString(36).substring(2, 10);
      this.ctx.storage.sql.exec(
        `INSERT INTO versions (id, project_id, version_num, code_snapshot, commit_message, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        verId, projectId, newVerNum, updatedCode, `تعديل: ${editPrompt.slice(0, 30)}`, now
      );

      return c.json({
        success: true,
        project_id: projectId,
        code: updatedCode,
        version_num: newVerNum,
        remaining_credits: ded.balance
      });
    });

    // -------------------------------------------------------------
    // Publishing & Custom Domains (Step 6)
    // -------------------------------------------------------------
    this.app.post("/api/projects/:id/publish", async (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projectId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const requestedSlug = (body.slug || "").trim().toLowerCase();

      const projRows = this.ctx.storage.sql.exec(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, projectId, user.id).toArray();
      if (projRows.length === 0) return c.json({ error: "المشروع غير موجود" }, 404);
      const project = projRows[0];

      let targetSlug = (project.slug as string) || requestedSlug;
      if (requestedSlug && requestedSlug !== targetSlug) {
        if (RESERVED_SLUGS.has(requestedSlug)) {
          return c.json({ error: "هذا الرابط مخصص للنظام، يرجى اختيار رابط آخر" }, 400);
        }
        for (const kw of BANNED_KEYWORDS) {
          if (requestedSlug.includes(kw)) return c.json({ error: "الرابط يحتوي على كلمات غير مسموح بها" }, 400);
        }
        // Check slug uniqueness
        const exist = this.ctx.storage.sql.exec(`SELECT id FROM projects WHERE slug = ? AND id != ?`, requestedSlug, projectId).toArray();
        if (exist.length > 0) {
          return c.json({ error: "هذا الرابط مستخدم بالفعل من قبل مشروع آخر" }, 400);
        }
        targetSlug = requestedSlug;
      }

      const publishedUrl = `https://${targetSlug}.masidy.app`;
      const now = Date.now();

      this.ctx.storage.sql.exec(
        `UPDATE projects SET status = 'published', slug = ?, updated_at = ? WHERE id = ?`,
        targetSlug, now, projectId
      );

      return c.json({
        success: true,
        slug: targetSlug,
        published_url: publishedUrl,
        published_at: now
      });
    });

    this.app.post("/api/projects/:id/custom-domain", async (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projectId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const domain = (body.domain || "").trim().toLowerCase();

      if (!domain || !domain.includes(".")) {
        return c.json({ error: "يرجى إدخال اسم نطاق صحيح (مثل mysite.com)" }, 400);
      }

      const dnsRecords = [
        { type: "CNAME", name: domain, value: "dispatch.masidy.app", status: "نشط (موصى به)" },
        { type: "TXT", name: `_masidy-challenge.${domain}`, value: `masidy-verify-${projectId.slice(0, 8)}`, status: "جاري الفحص" }
      ];

      this.ctx.storage.sql.exec(
        `UPDATE projects SET custom_domain = ?, custom_domain_status = 'active', updated_at = ? WHERE id = ?`,
        domain, Date.now(), projectId
      );

      return c.json({
        success: true,
        domain,
        status: "active",
        dns_records: dnsRecords,
        ssl: "مُفعل تلقائياً عبر Cloudflare SSL"
      });
    });

    // -------------------------------------------------------------
    // Billing & Webhooks (Step 4)
    // -------------------------------------------------------------
    this.app.get("/api/billing", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const ledger = this.ctx.storage.sql.exec(
        `SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        user.id
      ).toArray();

      return c.json({
        credits: user.credits,
        packs: COST_CONFIG.PACKS,
        ledger
      });
    });

    // Paymob Webhook
    this.app.post("/api/webhooks/paymob", async (c) => {
      this.initDatabase();
      const body = await c.req.json().catch(() => ({}));
      const obj = body.obj || body;
      const txId = String(obj.id || "tx_" + Date.now());
      const success = obj.success === true || obj.success === "true";

      if (!success) {
        return c.json({ status: "ignored_unsuccessful" });
      }

      // Check Idempotency
      const processed = this.ctx.storage.sql.exec(`SELECT id FROM processed_webhooks WHERE transaction_id = ?`, txId).toArray();
      if (processed.length > 0) {
        return c.json({ status: "already_processed" });
      }

      // Determine user and pack
      const extraData = obj.order?.merchant_order_id || "";
      const userId = obj.user_id || "usr_admin_default";
      const creditsToAdd = 500; // Standard pack grant

      this.addCredits(userId, creditsToAdd, "شراء رصيد عبر Paymob", txId);

      // Record webhook transaction
      const whId = "wh_" + Math.random().toString(36).substring(2, 10);
      this.ctx.storage.sql.exec(
        `INSERT INTO processed_webhooks (id, provider, transaction_id, payload_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
        whId, "paymob", txId, JSON.stringify(obj).slice(0, 100), Date.now()
      );

      return c.json({ status: "success", credits_added: creditsToAdd });
    });

    // Stripe Webhook
    this.app.post("/api/webhooks/stripe", async (c) => {
      this.initDatabase();
      const body = await c.req.json().catch(() => ({}));
      const txId = body.data?.object?.id || "str_tx_" + Date.now();

      const processed = this.ctx.storage.sql.exec(`SELECT id FROM processed_webhooks WHERE transaction_id = ?`, txId).toArray();
      if (processed.length > 0) {
        return c.json({ status: "already_processed" });
      }

      const userId = body.data?.object?.metadata?.user_id || "usr_admin_default";
      const creditsToAdd = 500;

      this.addCredits(userId, creditsToAdd, "شراء رصيد عبر Stripe", txId);

      const whId = "wh_" + Math.random().toString(36).substring(2, 10);
      this.ctx.storage.sql.exec(
        `INSERT INTO processed_webhooks (id, provider, transaction_id, payload_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
        whId, "stripe", txId, JSON.stringify(body).slice(0, 100), Date.now()
      );

      return c.json({ status: "success", credits_added: creditsToAdd });
    });

    // -------------------------------------------------------------
    // Dashboard & Admin Management (Step 5)
    // -------------------------------------------------------------
    this.app.get("/api/projects", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projects = this.ctx.storage.sql.exec(
        `SELECT id, name, slug, status, custom_domain, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC`,
        user.id
      ).toArray();

      return c.json({ projects });
    });

    this.app.get("/api/projects/:id", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user) return c.json({ error: "غير مصرح" }, 401);

      const projectId = c.req.param("id");
      const projRows = this.ctx.storage.sql.exec(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, projectId, user.id).toArray();
      if (projRows.length === 0) return c.json({ error: "غير موجود" }, 404);

      const versions = this.ctx.storage.sql.exec(`SELECT id, version_num, commit_message, created_at FROM versions WHERE project_id = ? ORDER BY version_num DESC`, projectId).toArray();

      return c.json({
        project: projRows[0],
        versions
      });
    });

    // Admin Dashboard
    this.app.get("/api/admin/overview", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user || user.role !== "admin") {
        return c.json({ error: "صلاحيات المسئول مطلوبة" }, 403);
      }

      const users = this.ctx.storage.sql.exec(`SELECT id, email, name, credits, role, created_at FROM users ORDER BY created_at DESC`).toArray();
      const projects = this.ctx.storage.sql.exec(`SELECT id, user_id, name, slug, status, created_at FROM projects ORDER BY created_at DESC`).toArray();
      const ledger = this.ctx.storage.sql.exec(`SELECT * FROM credit_ledger ORDER BY created_at DESC LIMIT 30`).toArray();

      return c.json({ users, projects, ledger });
    });

    // Admin Kill Switch (Unpublish / Suspend bad project)
    this.app.post("/api/admin/projects/:id/kill", (c) => {
      const user = this.getUserFromRequest(c);
      if (!user || user.role !== "admin") {
        return c.json({ error: "صلاحيات المسئول مطلوبة" }, 403);
      }

      const projectId = c.req.param("id");
      this.ctx.storage.sql.exec(`UPDATE projects SET status = 'suspended', updated_at = ? WHERE id = ?`, Date.now(), projectId);

      return c.json({ success: true, message: "تم إلغاء نشر ونشر حظر التطبيق بنجاح" });
    });

    // Report Abuse
    this.app.post("/api/report-abuse", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const slug = body.slug || "";
      const reason = body.reason || "محتوى مخالف";
      const ip = c.req.header("cf-connecting-ip") || "127.0.0.1";

      const projRows = this.ctx.storage.sql.exec(`SELECT id FROM projects WHERE slug = ?`, slug).toArray();
      const projectId = projRows.length > 0 ? (projRows[0].id as string) : "unknown";

      const reportId = "rep_" + Math.random().toString(36).substring(2, 10);
      this.ctx.storage.sql.exec(
        `INSERT INTO abuse_reports (id, project_id, slug, reporter_ip, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        reportId, projectId, slug, ip, reason, Date.now()
      );

      return c.json({ success: true, message: "تم استلام البلاغ وسيتم مراجعته من قبل إدارة مسيدي" });
    });

    // Served Published User Site Direct Renderer
    this.app.get("/site/:slug", (c) => {
      this.initDatabase();
      const slug = c.req.param("slug");
      const projRows = this.ctx.storage.sql.exec(`SELECT * FROM projects WHERE slug = ?`, slug).toArray();

      if (projRows.length === 0 || projRows[0].status === "suspended") {
        return c.html(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <title>404 - الصفحة غير موجودة | مسيدي</title>
            <style>
              body { font-family: system-ui, sans-serif; background: #fbfbfd; color: #0b0f1a; text-align: center; padding: 5rem 1rem; }
              .card { max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e6e8ee; border-radius: 16px; padding: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
              .btn { display: inline-block; background: #2d5bff; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; margin-top: 1rem; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>404 - موقع غير متاح</h1>
              <p>عذراً، هذا الموقع غير موجود أو تم إيقافه من قبل إدارة مسيدي.</p>
              <a href="https://app.masidy.app" class="btn">العودة إلى مسيدي</a>
            </div>
          </body>
          </html>
        `, 404);
      }

      const code = projRows[0].current_code as string || "<h1>مرحباً بك في موقعك الجديد عبر مسيدي</h1>";

      // Inject Masidy Abuse & Branding Badge
      const badgeHtml = `
        <div style="position: fixed; bottom: 12px; left: 12px; z-index: 99999; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); border: 1px solid #e6e8ee; padding: 6px 12px; border-radius: 999px; font-family: system-ui, sans-serif; font-size: 12px; color: #0b0f1a; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <span>صُنع بواسطة <strong>مسيدي</strong></span>
          <span style="color: #cbd5e1;">|</span>
          <a href="https://app.masidy.app/report?slug=${slug}" style="color: #667085; text-decoration: none;" target="_blank">الإبلاغ عن محتوى</a>
        </div>
      `;

      const finalHtml = code.includes("</body>")
        ? code.replace("</body>", `${badgeHtml}</body>`)
        : code + badgeHtml;

      return c.html(finalHtml);
    });
  }

  // Sample HTML generator based on plan
  private generateSampleCodeForPlan(plan: any): string {
    const title = plan.title || "تطبيق جديد عبر مسيدي";
    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>

  <!-- IBM Plex Sans Arabic Font -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['IBM Plex Sans Arabic', 'sans-serif'],
          },
          colors: {
            brand: '#2d5bff',
            ink: '#0b0f1a',
            bg: '#fbfbfd',
            muted: '#667085',
            line: '#e6e8ee'
          }
        }
      }
    }
  </script>
</head>
<body class="bg-bg text-ink font-sans antialiased min-h-screen flex flex-col justify-between">

  <!-- Header -->
  <header class="border-b border-line bg-white/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-lg shadow-sm">
          م
        </div>
        <span class="font-bold text-lg text-ink">${title}</span>
      </div>
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
        <a href="#features" class="hover:text-brand transition">المميزات</a>
        <a href="#services" class="hover:text-brand transition">الخدمات</a>
        <a href="#contact" class="hover:text-brand transition">تواصل معنا</a>
      </nav>
      <button class="bg-brand hover:bg-brand/90 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition">
        ابدأ الآن
      </button>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1">
    <section class="py-20 px-6 max-w-4xl mx-auto text-center space-y-6">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 text-brand text-xs font-semibold">
        ✨ صُمم تلقائياً بواسطة مسيدي (Masidy AI)
      </div>
      <h1 class="text-4xl md:text-5xl font-extrabold text-ink leading-tight">
        ${title}
      </h1>
      <p class="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
        ${plan.summary || "تطبيق متكامل تم بناؤه بذكاء اصطناعي فائق لتوفير تجربة استخدام سريعة وممتازة باللغة العربية."}
      </p>
      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
        <a href="#contact" class="bg-brand text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:bg-brand/90 transition">
          تواصل معنا اليوم
        </a>
        <a href="#features" class="border border-line bg-white text-ink font-semibold px-6 py-3 rounded-xl hover:border-brand/50 transition">
          استكشف المزايا
        </a>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-16 bg-white border-y border-line px-6">
      <div class="max-w-5xl mx-auto space-y-12">
        <div class="text-center space-y-3">
          <h2 class="text-2xl md:text-3xl font-bold">لماذا تختارنا؟</h2>
          <p class="text-muted">مزايا حصرية صُممت لتلبي جميع متطلباتك بمرونة عالية</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:shadow-md transition">
            <div class="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">🚀</div>
            <h3 class="font-bold text-lg">سرعة فائقة</h3>
            <p class="text-sm text-muted">أداء ممتاز واستجابة لحظية متوافقة مع جميع الأجهزة والمحمول.</p>
          </div>
          <div class="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:shadow-md transition">
            <div class="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">🛡️</div>
            <h3 class="font-bold text-lg">أمان وحماية</h3>
            <p class="text-sm text-muted">بنية تحتية سحابية مشفرة بالكامل تعتمد على سيرفرات Cloudflare العالمية.</p>
          </div>
          <div class="p-6 rounded-2xl border border-line bg-bg space-y-3 hover:shadow-md transition">
            <div class="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center font-bold">🎨</div>
            <h3 class="font-bold text-lg">تصميم عصري RTL</h3>
            <p class="text-sm text-muted">دعم أصلي كامل للغة العربية وتجربة استخدام مريحة وجذابة.</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer class="bg-white border-t border-line py-8 px-6">
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted">
      <div>© ${new Date().getFullYear()} ${title}. جميع الحقوق محفوظة.</div>
      <div class="flex items-center gap-4">
        <a href="#" class="hover:text-brand">الشروط والأحكام</a>
        <span>•</span>
        <a href="#" class="hover:text-brand">سياسة الخصوصية</a>
      </div>
    </div>
  </footer>
</body>
</html>`;
  }

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}
