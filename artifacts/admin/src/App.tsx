import { type FormEvent, useEffect, useMemo, useState } from "react";

type Period = "week" | "month" | "all";

interface StatsResponse {
  totalUsers: number;
  activeUsers30d: number;
  newUsersThisMonth: number;
  totalTokensAllTime: number;
  totalTokensThisMonth: number;
  estimatedCostThisMonth: number;
  estimatedCostLastMonth: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  createdAt: string;
  lastActiveAt: string;
  usage: {
    totalTokens: number;
    tokensByFeature: Record<string, number>;
    tokensByProduct: {
      videoAnalysis: { totalTokens: number; estimatedCostUsd: number };
      contentPlanner: { totalTokens: number; estimatedCostUsd: number };
      youtubeGrowth: { totalTokens: number; estimatedCostUsd: number };
    };
    tokensByModel: Record<string, {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }>;
    videoAnalysesTotal: number;
    videoAnalysesFailed: number;
    videoAnalysisFailureReasons: Array<{ reason: string; count: number }>;
    contentCreatorChatsCount: number;
    videoAnalysesCount: number;
    ytPlansGeneratedCount: number;
    ytIdeasRegeneratedCount: number;
    chartsCreatedCount: number;
    estimatedCostUsd: number;
    quotaUsedPct: number;
  };
}

interface UserDetail extends AdminUser {
  recentActivity: Array<{
    feature: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    createdAt: string;
  }>;
}

interface TokensResponse {
  byFeature: Array<{
    feature: string;
    totalTokens: number;
    estimatedCostUsd: number;
    callCount: number;
    avgTokensPerCall: number;
  }>;
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    callCount: number;
  }>;
  period: Period;
}

const featureLabels: Record<string, string> = {
  videoAnalysis: "Video analysis",
  ytPlanGenerate: "YT plans",
  ytPlanRegenerate: "Idea regenerations",
  channelSync: "Channel sync",
  improveIdea: "Idea improves",
  perfSummary: "Performance summaries",
  chartGeneration: "Charts",
  contentCreation: "Content creation",
  growthPlanner: "Growth planner",
};

const productLabels: Record<keyof AdminUser["usage"]["tokensByProduct"], string> = {
  videoAnalysis: "Video analysis",
  contentPlanner: "Content planner",
  youtubeGrowth: "YouTube Growth",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? "compact" : "standard" }).format(value || 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
  }).format(value || 0);
}

function formatDate(value: string) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Unauthorized");
  }
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function LoginView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Login failed");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Could not reach the admin gateway");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="seal">DT</div>
        <p className="eyebrow">DayTabs control</p>
        <h1>Operator access</h1>
        <p className="login-copy">Private usage, cost, and account telemetry. No public navigation points here.</p>
        <form onSubmit={submit} className="login-form">
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? "Verifying..." : "Enter control room"}</button>
        </form>
      </section>
    </main>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

function DashboardView() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tokens, setTokens] = useState<TokensResponse | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<StatsResponse>("/api/admin/stats"),
      apiFetch<{ users: AdminUser[] }>("/api/admin/users"),
      apiFetch<TokensResponse>(`/api/admin/tokens?period=${period}`),
    ])
      .then(([statsData, usersData, tokensData]) => {
        if (!active) return;
        setStats(statsData);
        setUsers(usersData.users);
        setTokens(tokensData);
      })
      .catch((err) => {
        if (!active || err instanceof Error && err.message === "Unauthorized") return;
        setError("Could not load admin data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      return;
    }
    let active = true;
    apiFetch<UserDetail>(`/api/admin/users/${selectedUserId}`)
      .then((data) => {
        if (active) setSelectedUser(data);
      })
      .catch(() => {
        if (active) setSelectedUser(null);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => `${user.name} ${user.email} ${user.plan}`.toLowerCase().includes(query));
  }, [search, users]);

  const maxFeatureTokens = Math.max(1, ...(tokens?.byFeature.map((feature) => feature.totalTokens) ?? [1]));
  const maxModelCost = Math.max(0.000001, ...(tokens?.byModel.map((model) => model.estimatedCostUsd) ?? [0.000001]));
  const topUsers = [...users].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens).slice(0, 5);
  const productTotals = users.reduce(
    (totals, user) => ({
      videoAnalysis: {
        totalTokens: totals.videoAnalysis.totalTokens + user.usage.tokensByProduct.videoAnalysis.totalTokens,
        estimatedCostUsd: totals.videoAnalysis.estimatedCostUsd + user.usage.tokensByProduct.videoAnalysis.estimatedCostUsd,
      },
      contentPlanner: {
        totalTokens: totals.contentPlanner.totalTokens + user.usage.tokensByProduct.contentPlanner.totalTokens,
        estimatedCostUsd: totals.contentPlanner.estimatedCostUsd + user.usage.tokensByProduct.contentPlanner.estimatedCostUsd,
      },
      youtubeGrowth: {
        totalTokens: totals.youtubeGrowth.totalTokens + user.usage.tokensByProduct.youtubeGrowth.totalTokens,
        estimatedCostUsd: totals.youtubeGrowth.estimatedCostUsd + user.usage.tokensByProduct.youtubeGrowth.estimatedCostUsd,
      },
    }),
    {
      videoAnalysis: { totalTokens: 0, estimatedCostUsd: 0 },
      contentPlanner: { totalTokens: 0, estimatedCostUsd: 0 },
      youtubeGrowth: { totalTokens: 0, estimatedCostUsd: 0 },
    },
  );

  async function logout() {
    await fetch("/api/auth/admin-logout", { method: "POST", credentials: "include" }).catch(() => null);
    window.location.assign("/login");
  }

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">DayTabs control</p>
          <h1>Admin Console</h1>
        </div>
        <button className="ghost-button" type="button" onClick={logout}>Log out</button>
      </header>

      {error ? <div className="notice">{error}</div> : null}

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Secure overview</p>
          <h2>Product usage, model cost, and account health in one private view.</h2>
        </div>
        <div className="period-switcher" aria-label="Token period">
          {(["week", "month", "all"] as Period[]).map((item) => (
            <button key={item} className={period === item ? "active" : ""} type="button" onClick={() => setPeriod(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Users" value={loading || !stats ? "..." : formatNumber(stats.totalUsers)} hint={`${stats ? formatNumber(stats.newUsersThisMonth) : "..."} new this month`} />
        <StatCard label="Active 30d" value={loading || !stats ? "..." : formatNumber(stats.activeUsers30d)} hint="Users with token activity" />
        <StatCard label="Tokens this month" value={loading || !stats ? "..." : formatNumber(stats.totalTokensThisMonth)} hint={`${stats ? formatNumber(stats.totalTokensAllTime) : "..."} all time`} />
        <StatCard label="Cost this month" value={loading || !stats ? "..." : formatCurrency(stats.estimatedCostThisMonth)} hint={`${stats ? formatCurrency(stats.estimatedCostLastMonth) : "..."} last month`} />
      </section>

      <section className="product-grid">
        {(Object.keys(productTotals) as Array<keyof typeof productTotals>).map((key) => (
          <article key={key} className="product-card">
            <p>{productLabels[key]}</p>
            <strong>{formatNumber(productTotals[key].totalTokens)}</strong>
            <span>{formatCurrency(productTotals[key].estimatedCostUsd)} total cost</span>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel feature-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Token mix</p>
              <h2>Feature load</h2>
            </div>
            <span>{tokens?.period ?? period}</span>
          </div>
          <div className="feature-list">
            {(tokens?.byFeature ?? []).map((feature) => (
              <div key={feature.feature} className="feature-row">
                <div>
                  <strong>{featureLabels[feature.feature] ?? feature.feature}</strong>
                  <span>{formatNumber(feature.callCount)} calls · {formatNumber(Math.round(feature.avgTokensPerCall))} avg tokens</span>
                </div>
                <div className="bar-track">
                  <div style={{ width: `${Math.max(4, (feature.totalTokens / maxFeatureTokens) * 100)}%` }} />
                </div>
                <b>{formatNumber(feature.totalTokens)}</b>
              </div>
            ))}
            {!tokens?.byFeature.length ? <p className="empty">No token logs for this period yet.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Model cost</p>
              <h2>Usage by model</h2>
            </div>
          </div>
          <div className="model-list">
            {(tokens?.byModel ?? []).map((model) => (
              <div key={model.model} className="model-row">
                <div>
                  <strong>{model.model}</strong>
                  <span>{formatNumber(model.inputTokens)} in · {formatNumber(model.outputTokens)} out · {formatNumber(model.callCount)} calls</span>
                </div>
                <div className="bar-track">
                  <div style={{ width: `${Math.max(4, (model.estimatedCostUsd / maxModelCost) * 100)}%` }} />
                </div>
                <b>{formatCurrency(model.estimatedCostUsd)}</b>
              </div>
            ))}
            {!tokens?.byModel.length ? <p className="empty">No model usage for this period yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="panel top-users-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Highest usage</p>
            <h2>Top accounts</h2>
          </div>
        </div>
        <div className="top-users">
          {topUsers.map((user, index) => (
            <button key={user.id} type="button" onClick={() => setSelectedUserId(user.id)}>
              <span>{index + 1}</span>
              <div>
                <strong>{user.name || user.email}</strong>
                <small>{formatNumber(user.usage.totalTokens)} tokens · {formatCurrency(user.usage.estimatedCostUsd)} · {formatNumber(user.usage.videoAnalysesTotal)} videos</small>
              </div>
            </button>
          ))}
          {!topUsers.length ? <p className="empty">No users loaded yet.</p> : null}
        </div>
      </section>

      <section className="panel users-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>User ledger</h2>
          </div>
          <input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, email, plan..." />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Last active</th>
                <th>Videos</th>
                <th>Failed</th>
                <th>Creator chats</th>
                <th>Video analysis</th>
                <th>Content planner</th>
                <th>YouTube Growth</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Quota</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} onClick={() => setSelectedUserId(user.id)}>
                  <td>
                    <strong>{user.name || "Unnamed user"}</strong>
                    <span>{user.email}</span>
                  </td>
                  <td>{user.plan}</td>
                  <td>{formatDate(user.lastActiveAt)}</td>
                  <td>{formatNumber(user.usage.videoAnalysesTotal)}</td>
                  <td>{formatNumber(user.usage.videoAnalysesFailed)}</td>
                  <td>{formatNumber(user.usage.contentCreatorChatsCount)}</td>
                  <td>{formatNumber(user.usage.tokensByProduct.videoAnalysis.totalTokens)}</td>
                  <td>{formatNumber(user.usage.tokensByProduct.contentPlanner.totalTokens)}</td>
                  <td>{formatNumber(user.usage.tokensByProduct.youtubeGrowth.totalTokens)}</td>
                  <td>{formatNumber(user.usage.totalTokens)}</td>
                  <td>{formatCurrency(user.usage.estimatedCostUsd)}</td>
                  <td>
                    <div className="quota">
                      <span>{Math.round(user.usage.quotaUsedPct)}%</span>
                      <div><i style={{ width: `${Math.min(100, user.usage.quotaUsedPct)}%` }} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredUsers.length ? <p className="empty">No users match that search.</p> : null}
        </div>
      </section>

      {selectedUserId ? (
        <div className="drawer-backdrop" onClick={() => setSelectedUserId(null)}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <button className="drawer-close" type="button" onClick={() => setSelectedUserId(null)}>Close</button>
            {!selectedUser ? (
              <p className="empty">Loading user...</p>
            ) : (
              <>
                <p className="eyebrow">User detail</p>
                <h2>{selectedUser.name || selectedUser.email}</h2>
                <p className="drawer-email">{selectedUser.email}</p>
                <div className="drawer-stats">
                  <StatCard label="Tokens" value={formatNumber(selectedUser.usage.totalTokens)} hint={`${Math.round(selectedUser.usage.quotaUsedPct)}% quota`} />
                  <StatCard label="Cost" value={formatCurrency(selectedUser.usage.estimatedCostUsd)} hint={selectedUser.plan} />
                  <StatCard label="Videos analyzed" value={formatNumber(selectedUser.usage.videoAnalysesTotal)} hint={`${formatNumber(selectedUser.usage.videoAnalysesFailed)} failed`} />
                  <StatCard label="Creator chats" value={formatNumber(selectedUser.usage.contentCreatorChatsCount)} hint="Script planner chats" />
                </div>
                <h3>Product token usage</h3>
                <div className="product-breakdown">
                  {(Object.keys(selectedUser.usage.tokensByProduct) as Array<keyof AdminUser["usage"]["tokensByProduct"]>).map((key) => (
                    <div key={key}>
                      <span>{productLabels[key]}</span>
                      <strong>{formatNumber(selectedUser.usage.tokensByProduct[key].totalTokens)}</strong>
                      <small>{formatCurrency(selectedUser.usage.tokensByProduct[key].estimatedCostUsd)}</small>
                    </div>
                  ))}
                </div>
                <h3>Model cost</h3>
                <div className="activity-list">
                  {Object.entries(selectedUser.usage.tokensByModel).map(([model, usage]) => (
                    <div key={model} className="activity-row">
                      <div>
                        <strong>{model}</strong>
                        <span>{formatNumber(usage.inputTokens)} input · {formatNumber(usage.outputTokens)} output</span>
                      </div>
                      <b>{formatCurrency(usage.estimatedCostUsd)}</b>
                    </div>
                  ))}
                  {!Object.keys(selectedUser.usage.tokensByModel).length ? <p className="empty">No model token usage logged for this user.</p> : null}
                </div>
                <h3>Video analysis failures</h3>
                <div className="activity-list">
                  {selectedUser.usage.videoAnalysisFailureReasons.map((failure) => (
                    <div key={failure.reason} className="activity-row">
                      <div>
                        <strong>{failure.reason}</strong>
                        <span>Failure reason</span>
                      </div>
                      <b>{formatNumber(failure.count)}</b>
                    </div>
                  ))}
                  {!selectedUser.usage.videoAnalysisFailureReasons.length ? <p className="empty">No video analysis failures recorded.</p> : null}
                </div>
                <h3>Recent activity</h3>
                <div className="activity-list">
                  {selectedUser.recentActivity.map((activity) => (
                    <div key={`${activity.feature}-${activity.createdAt}`} className="activity-row">
                      <div>
                        <strong>{featureLabels[activity.feature] ?? activity.feature}</strong>
                        <span>{activity.model} · {formatDate(activity.createdAt)}</span>
                      </div>
                      <b>{formatNumber(activity.inputTokens + activity.outputTokens)}</b>
                    </div>
                  ))}
                  {!selectedUser.recentActivity.length ? <p className="empty">No activity has been logged for this user.</p> : null}
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}

export default function App() {
  const isLogin = window.location.pathname.startsWith("/login");
  return isLogin ? <LoginView /> : <DashboardView />;
}
