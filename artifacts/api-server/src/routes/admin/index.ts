import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../../lib/adminAuth";
import { TOKEN_PRODUCT_AREA_SQL_CASE } from "../../lib/tokenUsageProducts";

const router = Router();

const TOKEN_FEATURES = [
  "videoAnalysis",
  "contentCreation",
  "growthPlanner",
  "ytPlanGenerate",
  "ytPlanRegenerate",
  "channelSync",
  "improveIdea",
  "perfSummary",
  "chartGeneration",
] as const;

const PLAN_TOKEN_QUOTAS: Record<string, number> = {
  free: 50_000,
  creator: 200_000,
  pro: 600_000,
  studio: 2_000_000,
};

const COST_SQL = `
  (
    input_tokens * CASE
      WHEN model = 'gpt-4o-mini' THEN 0.15 / 1000000.0
      WHEN model = 'gpt-4o' THEN 2.50 / 1000000.0
      ELSE 2.50 / 1000000.0
    END
    +
    output_tokens * CASE
      WHEN model = 'gpt-4o-mini' THEN 0.60 / 1000000.0
      WHEN model = 'gpt-4o' THEN 10.00 / 1000000.0
      ELSE 10.00 / 1000000.0
    END
  )
`;

const FEATURE_GROUP_SQL = TOKEN_PRODUCT_AREA_SQL_CASE;

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toIso(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function emptyTokensByFeature() {
  return Object.fromEntries(TOKEN_FEATURES.map((feature) => [feature, 0])) as Record<(typeof TOKEN_FEATURES)[number], number>;
}

function emptyProductUsage() {
  return {
    videoAnalysis: { totalTokens: 0, estimatedCostUsd: 0 },
    contentPlanner: { totalTokens: 0, estimatedCostUsd: 0 },
    youtubeGrowth: { totalTokens: 0, estimatedCostUsd: 0 },
  };
}

router.get("/stats", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (auth !== true) return;

  try {
    const { rows } = await pool.query<{
      total_users: string;
      active_users_30d: string;
      new_users_this_month: string;
      total_tokens_all_time: string;
      total_tokens_this_month: string;
      estimated_cost_this_month: string;
      estimated_cost_last_month: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(DISTINCT user_id) FROM token_logs WHERE created_at >= now() - interval '30 days') AS active_users_30d,
        (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('month', now())) AS new_users_this_month,
        (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM token_logs) AS total_tokens_all_time,
        (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM token_logs WHERE created_at >= date_trunc('month', now())) AS total_tokens_this_month,
        (SELECT COALESCE(SUM(${COST_SQL}), 0) FROM token_logs WHERE created_at >= date_trunc('month', now())) AS estimated_cost_this_month,
        (
          SELECT COALESCE(SUM(${COST_SQL}), 0)
          FROM token_logs
          WHERE created_at >= date_trunc('month', now()) - interval '1 month'
            AND created_at < date_trunc('month', now())
        ) AS estimated_cost_last_month
    `);
    const row = rows[0];
    res.json({
      totalUsers: toNumber(row.total_users),
      activeUsers30d: toNumber(row.active_users_30d),
      newUsersThisMonth: toNumber(row.new_users_this_month),
      totalTokensAllTime: toNumber(row.total_tokens_all_time),
      totalTokensThisMonth: toNumber(row.total_tokens_this_month),
      estimatedCostThisMonth: toNumber(row.estimated_cost_this_month),
      estimatedCostLastMonth: toNumber(row.estimated_cost_last_month),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Failed to load admin stats" });
  }
});

router.get("/users", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (auth !== true) return;

  try {
    const { rows } = await pool.query<{
      id: number;
      name: string | null;
      email: string;
      plan: string;
      created_at: Date;
      last_active_at: Date | null;
      total_tokens: string;
      estimated_cost_usd: string;
      video_analyses_total: string;
      video_analyses_failed: string;
      script_chats_count: string;
      video_analyses_count: string;
      yt_plans_generated_count: string;
      yt_ideas_regenerated_count: string;
      charts_created_count: string;
      tokens_by_feature: Record<string, number> | null;
      tokens_by_product: Record<string, { totalTokens?: number; estimatedCostUsd?: number }> | null;
      tokens_by_model: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number }> | null;
      failure_reasons: Array<{ reason: string; count: number }> | null;
      video_analysis_tokens_used: string;
      content_planner_tokens_used: string;
      youtube_growth_tokens_used: string;
    }>(`
      WITH token_rows AS (
        SELECT
          user_id,
          feature,
          model,
          input_tokens,
          output_tokens,
          created_at,
          ${COST_SQL} AS calculated_cost,
          ${FEATURE_GROUP_SQL} AS product_area
        FROM token_logs
      ),
      token_totals AS (
        SELECT
          user_id,
          MAX(created_at) AS last_active_at,
          COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
          COALESCE(SUM(calculated_cost), 0) AS estimated_cost_usd,
          COUNT(*) FILTER (WHERE feature = 'videoAnalysis') AS video_analyses_count,
          COUNT(*) FILTER (WHERE feature = 'ytPlanGenerate') AS yt_plans_generated_count,
          COUNT(*) FILTER (WHERE feature = 'ytPlanRegenerate') AS yt_ideas_regenerated_count,
          COUNT(*) FILTER (WHERE feature = 'chartGeneration') AS charts_created_count
        FROM token_rows
        GROUP BY user_id
      ),
      feature_totals AS (
        SELECT user_id, jsonb_object_agg(feature, total_tokens) AS tokens_by_feature
        FROM (
          SELECT user_id, feature, SUM(input_tokens + output_tokens) AS total_tokens
          FROM token_rows
          GROUP BY user_id, feature
        ) totals
        GROUP BY user_id
      ),
      product_totals AS (
        SELECT user_id, jsonb_object_agg(product_area, jsonb_build_object('totalTokens', total_tokens, 'estimatedCostUsd', estimated_cost_usd)) AS tokens_by_product
        FROM (
          SELECT
            user_id,
            product_area,
            SUM(input_tokens + output_tokens) AS total_tokens,
            SUM(calculated_cost) AS estimated_cost_usd
          FROM token_rows
          WHERE product_area IS NOT NULL
          GROUP BY user_id, product_area
        ) totals
        GROUP BY user_id
      ),
      model_totals AS (
        SELECT user_id, jsonb_object_agg(model, model_payload) AS tokens_by_model
        FROM (
          SELECT
            user_id,
            model,
            jsonb_build_object(
              'inputTokens', COALESCE(SUM(input_tokens), 0),
              'outputTokens', COALESCE(SUM(output_tokens), 0),
              'totalTokens', COALESCE(SUM(input_tokens + output_tokens), 0),
              'estimatedCostUsd', COALESCE(SUM(calculated_cost), 0)
            ) AS model_payload
          FROM token_rows
          GROUP BY user_id, model
        ) totals
        GROUP BY user_id
      ),
      analysis_totals AS (
        SELECT
          user_id,
          COUNT(*) AS video_analyses_total,
          COUNT(*) FILTER (WHERE error IS NOT NULL OR status IN ('failed', 'error')) AS video_analyses_failed
        FROM analysis_jobs
        GROUP BY user_id
      ),
      failure_reasons AS (
        SELECT user_id, jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC) AS failure_reasons
        FROM (
          SELECT
            user_id,
            COALESCE(NULLIF(error, ''), NULLIF(current_step, ''), status, 'Unknown failure') AS reason,
            COUNT(*) AS count
          FROM analysis_jobs
          WHERE user_id IS NOT NULL AND (error IS NOT NULL OR status IN ('failed', 'error'))
          GROUP BY user_id, reason
        ) grouped
        GROUP BY user_id
      ),
      script_chat_totals AS (
        SELECT user_id, COUNT(*) AS script_chats_count
        FROM script_planner_chats
        GROUP BY user_id
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.plan,
        u.created_at,
        token_totals.last_active_at,
        COALESCE(token_totals.total_tokens, 0) AS total_tokens,
        COALESCE(token_totals.estimated_cost_usd, 0) AS estimated_cost_usd,
        COALESCE(analysis_totals.video_analyses_total, 0) AS video_analyses_total,
        COALESCE(analysis_totals.video_analyses_failed, 0) AS video_analyses_failed,
        COALESCE(script_chat_totals.script_chats_count, 0) AS script_chats_count,
        COALESCE(token_totals.video_analyses_count, 0) AS video_analyses_count,
        COALESCE(token_totals.yt_plans_generated_count, 0) AS yt_plans_generated_count,
        COALESCE(token_totals.yt_ideas_regenerated_count, 0) AS yt_ideas_regenerated_count,
        COALESCE(token_totals.charts_created_count, 0) AS charts_created_count,
        COALESCE(feature_totals.tokens_by_feature, '{}'::jsonb) AS tokens_by_feature,
        COALESCE(product_totals.tokens_by_product, '{}'::jsonb) AS tokens_by_product,
        COALESCE(model_totals.tokens_by_model, '{}'::jsonb) AS tokens_by_model,
        COALESCE(failure_reasons.failure_reasons, '[]'::jsonb) AS failure_reasons,
        COALESCE(uu.video_analysis_tokens_used, 0) AS video_analysis_tokens_used,
        COALESCE(uu.content_planner_tokens_used, 0) AS content_planner_tokens_used,
        COALESCE(uu.youtube_growth_tokens_used, 0) AS youtube_growth_tokens_used
      FROM users u
      LEFT JOIN token_totals ON token_totals.user_id = u.id
      LEFT JOIN feature_totals ON feature_totals.user_id = u.id
      LEFT JOIN product_totals ON product_totals.user_id = u.id
      LEFT JOIN model_totals ON model_totals.user_id = u.id
      LEFT JOIN analysis_totals ON analysis_totals.user_id = u.id
      LEFT JOIN failure_reasons ON failure_reasons.user_id = u.id
      LEFT JOIN script_chat_totals ON script_chat_totals.user_id = u.id
      LEFT JOIN user_usage uu ON uu.user_id = u.id
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: rows.map((row) => {
        const totalTokens = toNumber(row.total_tokens);
        const tokensByFeature = emptyTokensByFeature();
        for (const feature of TOKEN_FEATURES) {
          tokensByFeature[feature] = toNumber(row.tokens_by_feature?.[feature]);
        }
        const tokensByProduct = emptyProductUsage();
        tokensByProduct.videoAnalysis.totalTokens = toNumber(row.video_analysis_tokens_used);
        tokensByProduct.contentPlanner.totalTokens = toNumber(row.content_planner_tokens_used);
        tokensByProduct.youtubeGrowth.totalTokens = toNumber(row.youtube_growth_tokens_used);
        tokensByProduct.videoAnalysis.estimatedCostUsd = toNumber(row.tokens_by_product?.videoAnalysis?.estimatedCostUsd);
        tokensByProduct.contentPlanner.estimatedCostUsd = toNumber(row.tokens_by_product?.contentPlanner?.estimatedCostUsd);
        tokensByProduct.youtubeGrowth.estimatedCostUsd = toNumber(row.tokens_by_product?.youtubeGrowth?.estimatedCostUsd);
        const quota = PLAN_TOKEN_QUOTAS[row.plan] ?? PLAN_TOKEN_QUOTAS.free;
        return {
          id: String(row.id),
          name: row.name ?? "",
          email: row.email,
          plan: row.plan,
          createdAt: toIso(row.created_at),
          lastActiveAt: toIso(row.last_active_at),
          usage: {
            totalTokens,
            tokensByFeature,
            tokensByProduct,
            tokensByModel: row.tokens_by_model ?? {},
            videoAnalysesTotal: toNumber(row.video_analyses_total),
            videoAnalysesFailed: toNumber(row.video_analyses_failed),
            videoAnalysisFailureReasons: row.failure_reasons ?? [],
            contentCreatorChatsCount: toNumber(row.script_chats_count),
            videoAnalysesCount: toNumber(row.video_analyses_count),
            ytPlansGeneratedCount: toNumber(row.yt_plans_generated_count),
            ytIdeasRegeneratedCount: toNumber(row.yt_ideas_regenerated_count),
            chartsCreatedCount: toNumber(row.charts_created_count),
            estimatedCostUsd: toNumber(row.estimated_cost_usd),
            quotaUsedPct: Math.min(100, (totalTokens / quota) * 100),
          },
        };
      }),
    });
  } catch (err) {
    req.log.error({ err }, "Admin users error");
    res.status(500).json({ error: "Failed to load admin users" });
  }
});

router.get("/users/:id", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (auth !== true) return;

  try {
    const [userResult, activityResult] = await Promise.all([
      pool.query<{
        id: number;
        name: string | null;
        email: string;
        plan: string;
        created_at: Date;
        last_active_at: Date | null;
        total_tokens: string;
        estimated_cost_usd: string;
        video_analyses_total: string;
        video_analyses_failed: string;
        script_chats_count: string;
        video_analyses_count: string;
        yt_plans_generated_count: string;
        yt_ideas_regenerated_count: string;
        charts_created_count: string;
        tokens_by_feature: Record<string, number> | null;
        tokens_by_product: Record<string, { totalTokens?: number; estimatedCostUsd?: number }> | null;
        tokens_by_model: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number }> | null;
        failure_reasons: Array<{ reason: string; count: number }> | null;
        video_analysis_tokens_used: string;
        content_planner_tokens_used: string;
        youtube_growth_tokens_used: string;
      }>(`
        WITH token_rows AS (
          SELECT
            user_id,
            feature,
            model,
            input_tokens,
            output_tokens,
            created_at,
            ${COST_SQL} AS calculated_cost,
            ${FEATURE_GROUP_SQL} AS product_area
          FROM token_logs
        ),
        token_totals AS (
          SELECT
            user_id,
            MAX(created_at) AS last_active_at,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
            COALESCE(SUM(calculated_cost), 0) AS estimated_cost_usd,
            COUNT(*) FILTER (WHERE feature = 'videoAnalysis') AS video_analyses_count,
            COUNT(*) FILTER (WHERE feature = 'ytPlanGenerate') AS yt_plans_generated_count,
            COUNT(*) FILTER (WHERE feature = 'ytPlanRegenerate') AS yt_ideas_regenerated_count,
            COUNT(*) FILTER (WHERE feature = 'chartGeneration') AS charts_created_count
          FROM token_rows
          GROUP BY user_id
        ),
        feature_totals AS (
          SELECT user_id, jsonb_object_agg(feature, total_tokens) AS tokens_by_feature
          FROM (
            SELECT user_id, feature, SUM(input_tokens + output_tokens) AS total_tokens
            FROM token_rows
            GROUP BY user_id, feature
          ) totals
          GROUP BY user_id
        ),
        product_totals AS (
          SELECT user_id, jsonb_object_agg(product_area, jsonb_build_object('totalTokens', total_tokens, 'estimatedCostUsd', estimated_cost_usd)) AS tokens_by_product
          FROM (
            SELECT
              user_id,
              product_area,
              SUM(input_tokens + output_tokens) AS total_tokens,
              SUM(calculated_cost) AS estimated_cost_usd
            FROM token_rows
            WHERE product_area IS NOT NULL
            GROUP BY user_id, product_area
          ) totals
          GROUP BY user_id
        ),
        model_totals AS (
          SELECT user_id, jsonb_object_agg(model, model_payload) AS tokens_by_model
          FROM (
            SELECT
              user_id,
              model,
              jsonb_build_object(
                'inputTokens', COALESCE(SUM(input_tokens), 0),
                'outputTokens', COALESCE(SUM(output_tokens), 0),
                'totalTokens', COALESCE(SUM(input_tokens + output_tokens), 0),
                'estimatedCostUsd', COALESCE(SUM(calculated_cost), 0)
              ) AS model_payload
            FROM token_rows
            GROUP BY user_id, model
          ) totals
          GROUP BY user_id
        ),
        analysis_totals AS (
          SELECT
            user_id,
            COUNT(*) AS video_analyses_total,
            COUNT(*) FILTER (WHERE error IS NOT NULL OR status IN ('failed', 'error')) AS video_analyses_failed
          FROM analysis_jobs
          GROUP BY user_id
        ),
        failure_reasons AS (
          SELECT user_id, jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC) AS failure_reasons
          FROM (
            SELECT
              user_id,
              COALESCE(NULLIF(error, ''), NULLIF(current_step, ''), status, 'Unknown failure') AS reason,
              COUNT(*) AS count
            FROM analysis_jobs
            WHERE user_id IS NOT NULL AND (error IS NOT NULL OR status IN ('failed', 'error'))
            GROUP BY user_id, reason
          ) grouped
          GROUP BY user_id
        ),
        script_chat_totals AS (
          SELECT user_id, COUNT(*) AS script_chats_count
          FROM script_planner_chats
          GROUP BY user_id
        )
        SELECT
          u.id,
          u.name,
          u.email,
          u.plan,
          u.created_at,
          token_totals.last_active_at,
          COALESCE(token_totals.total_tokens, 0) AS total_tokens,
          COALESCE(token_totals.estimated_cost_usd, 0) AS estimated_cost_usd,
          COALESCE(analysis_totals.video_analyses_total, 0) AS video_analyses_total,
          COALESCE(analysis_totals.video_analyses_failed, 0) AS video_analyses_failed,
          COALESCE(script_chat_totals.script_chats_count, 0) AS script_chats_count,
          COALESCE(token_totals.video_analyses_count, 0) AS video_analyses_count,
          COALESCE(token_totals.yt_plans_generated_count, 0) AS yt_plans_generated_count,
          COALESCE(token_totals.yt_ideas_regenerated_count, 0) AS yt_ideas_regenerated_count,
          COALESCE(token_totals.charts_created_count, 0) AS charts_created_count,
          COALESCE(feature_totals.tokens_by_feature, '{}'::jsonb) AS tokens_by_feature,
          COALESCE(product_totals.tokens_by_product, '{}'::jsonb) AS tokens_by_product,
          COALESCE(model_totals.tokens_by_model, '{}'::jsonb) AS tokens_by_model,
          COALESCE(failure_reasons.failure_reasons, '[]'::jsonb) AS failure_reasons,
          COALESCE(uu.video_analysis_tokens_used, 0) AS video_analysis_tokens_used,
          COALESCE(uu.content_planner_tokens_used, 0) AS content_planner_tokens_used,
          COALESCE(uu.youtube_growth_tokens_used, 0) AS youtube_growth_tokens_used
        FROM users u
        LEFT JOIN token_totals ON token_totals.user_id = u.id
        LEFT JOIN feature_totals ON feature_totals.user_id = u.id
        LEFT JOIN product_totals ON product_totals.user_id = u.id
        LEFT JOIN model_totals ON model_totals.user_id = u.id
        LEFT JOIN analysis_totals ON analysis_totals.user_id = u.id
        LEFT JOIN failure_reasons ON failure_reasons.user_id = u.id
        LEFT JOIN script_chat_totals ON script_chat_totals.user_id = u.id
        LEFT JOIN user_usage uu ON uu.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]),
      pool.query<{
        feature: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: string | null;
        created_at: Date;
      }>(`
        SELECT feature, model, input_tokens, output_tokens, ${COST_SQL} AS cost_usd, created_at
        FROM token_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [req.params.id]),
    ]);

    const row = userResult.rows[0];
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const totalTokens = toNumber(row.total_tokens);
    const tokensByFeature = emptyTokensByFeature();
    for (const feature of TOKEN_FEATURES) {
      tokensByFeature[feature] = toNumber(row.tokens_by_feature?.[feature]);
    }
    const tokensByProduct = emptyProductUsage();
    tokensByProduct.videoAnalysis.totalTokens = toNumber(row.video_analysis_tokens_used);
    tokensByProduct.contentPlanner.totalTokens = toNumber(row.content_planner_tokens_used);
    tokensByProduct.youtubeGrowth.totalTokens = toNumber(row.youtube_growth_tokens_used);
    tokensByProduct.videoAnalysis.estimatedCostUsd = toNumber(row.tokens_by_product?.videoAnalysis?.estimatedCostUsd);
    tokensByProduct.contentPlanner.estimatedCostUsd = toNumber(row.tokens_by_product?.contentPlanner?.estimatedCostUsd);
    tokensByProduct.youtubeGrowth.estimatedCostUsd = toNumber(row.tokens_by_product?.youtubeGrowth?.estimatedCostUsd);
    const quota = PLAN_TOKEN_QUOTAS[row.plan] ?? PLAN_TOKEN_QUOTAS.free;

    res.json({
      id: String(row.id),
      name: row.name ?? "",
      email: row.email,
      plan: row.plan,
      createdAt: toIso(row.created_at),
      lastActiveAt: toIso(row.last_active_at),
      usage: {
        totalTokens,
        tokensByFeature,
        tokensByProduct,
        tokensByModel: row.tokens_by_model ?? {},
        videoAnalysesTotal: toNumber(row.video_analyses_total),
        videoAnalysesFailed: toNumber(row.video_analyses_failed),
        videoAnalysisFailureReasons: row.failure_reasons ?? [],
        contentCreatorChatsCount: toNumber(row.script_chats_count),
        videoAnalysesCount: toNumber(row.video_analyses_count),
        ytPlansGeneratedCount: toNumber(row.yt_plans_generated_count),
        ytIdeasRegeneratedCount: toNumber(row.yt_ideas_regenerated_count),
        chartsCreatedCount: toNumber(row.charts_created_count),
        estimatedCostUsd: toNumber(row.estimated_cost_usd),
        quotaUsedPct: Math.min(100, (totalTokens / quota) * 100),
      },
      recentActivity: activityResult.rows.map((activity) => ({
        feature: activity.feature,
        model: activity.model,
        inputTokens: activity.input_tokens,
        outputTokens: activity.output_tokens,
        costUsd: toNumber(activity.cost_usd),
        createdAt: toIso(activity.created_at),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin user detail error");
    res.status(500).json({ error: "Failed to load admin user" });
  }
});

router.get("/tokens", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (auth !== true) return;

  const period = req.query.period === "week" || req.query.period === "month" || req.query.period === "all"
    ? req.query.period
    : "month";
  const where = period === "week"
    ? "WHERE created_at >= now() - interval '7 days'"
    : period === "month"
      ? "WHERE created_at >= date_trunc('month', now())"
      : "";

  try {
    const { rows } = await pool.query<{
      feature: string;
      total_tokens: string;
      estimated_cost_usd: string;
      call_count: string;
      avg_tokens_per_call: string;
    }>(`
      SELECT
        feature,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COALESCE(SUM(${COST_SQL}), 0) AS estimated_cost_usd,
        COUNT(*) AS call_count,
        COALESCE(AVG(input_tokens + output_tokens), 0) AS avg_tokens_per_call
      FROM token_logs
      ${where}
      GROUP BY feature
      ORDER BY total_tokens DESC
    `);

    const { rows: modelRows } = await pool.query<{
      model: string;
      input_tokens: string;
      output_tokens: string;
      total_tokens: string;
      estimated_cost_usd: string;
      call_count: string;
    }>(`
      SELECT
        model,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens,
        COALESCE(SUM(${COST_SQL}), 0) AS estimated_cost_usd,
        COUNT(*) AS call_count
      FROM token_logs
      ${where}
      GROUP BY model
      ORDER BY estimated_cost_usd DESC
    `);

    res.json({
      byFeature: rows.map((row) => ({
        feature: row.feature,
        totalTokens: toNumber(row.total_tokens),
        estimatedCostUsd: toNumber(row.estimated_cost_usd),
        callCount: toNumber(row.call_count),
        avgTokensPerCall: toNumber(row.avg_tokens_per_call),
      })),
      byModel: modelRows.map((row) => ({
        model: row.model,
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
        totalTokens: toNumber(row.total_tokens),
        estimatedCostUsd: toNumber(row.estimated_cost_usd),
        callCount: toNumber(row.call_count),
      })),
      period,
    });
  } catch (err) {
    req.log.error({ err }, "Admin tokens error");
    res.status(500).json({ error: "Failed to load admin token usage" });
  }
});

export default router;
