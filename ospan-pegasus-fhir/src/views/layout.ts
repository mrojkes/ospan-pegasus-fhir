export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAV = [
  { href: "/back-office", label: "Inicio" },
  { href: "/back-office/sync", label: "Sincronizar por fecha" },
  { href: "/back-office/pacientes", label: "Buscar paciente" },
  { href: "/back-office/reportes", label: "Reportes" },
];

export function renderPage(title: string, bodyHtml: string, activePath = ""): string {
  const navHtml = NAV.map(
    (item) =>
      `<a href="${item.href}" class="nav-link${activePath === item.href ? " active" : ""}">${item.label}</a>`
  ).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · OSPAN Back Office</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --border: #e2e5ea; --text: #1f2430;
    --muted: #6b7280; --accent: #2f6fed; --accent-weak: #eaf0fe;
    --ok: #1a7f4f; --warn: #b9770e; --danger: #c23a3a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--text); font-size: 14px;
  }
  header {
    background: #14213d; color: #fff; padding: 14px 24px;
    display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .subtitle { color: #9fb0d6; font-size: 12px; }
  nav { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
  .nav-link {
    color: #d9e2f7; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 13px;
  }
  .nav-link:hover, .nav-link.active { background: rgba(255,255,255,0.12); color: #fff; }
  main { max-width: 1080px; margin: 24px auto; padding: 0 20px 60px; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 20px; margin-bottom: 20px;
  }
  h2 { font-size: 18px; margin-top: 0; }
  h3 { font-size: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; margin-top: 10px; }
  input[type=text], input[type=date], select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;
  }
  button, .btn {
    background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 6px;
    font-size: 14px; cursor: pointer; margin-top: 14px; display: inline-block; text-decoration: none;
  }
  button.secondary, .btn.secondary { background: #fff; color: var(--accent); border: 1px solid var(--accent); }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  }
  .badge.ok { background: #e4f6ed; color: var(--ok); }
  .badge.warn { background: #fdf0dc; color: var(--warn); }
  .badge.danger { background: #fbe7e7; color: var(--danger); }
  .badge.neutral { background: var(--accent-weak); color: var(--accent); }
  .muted { color: var(--muted); }
  .aviso { background: #fdf0dc; border: 1px solid #f0d9ac; color: #7a5300; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
  .error { background: #fbe7e7; border: 1px solid #f0b8b8; color: #7a1f1f; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  a { color: var(--accent); }
  .adjunto-link { display: inline-block; margin: 2px 6px 2px 0; font-size: 12px; }
  details summary { cursor: pointer; color: var(--accent); font-size: 12px; margin-top: 8px; }
  .field-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 12px 0 4px; font-weight: 600; }
  .evo-block { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
  .evo-block p:first-child { margin-top: 0; }
  .evo-block p:last-child { margin-bottom: 0; }
  .paciente-header h2 { margin-bottom: 4px; }
  .paciente-header .especie { font-weight: 400; font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <div>
    <h1>OSPAN · Repositorio de Datos Clínicos</h1>
    <div class="subtitle">Prototipo · órdenes médicas Pegasus (Panda)</div>
  </div>
  <nav>${navHtml}</nav>
</header>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}

export function estadoBadge(idEstado: number, estadoNombre: string): string {
  const clase =
    idEstado === 3 || idEstado === 5
      ? "ok"
      : idEstado === 2 || idEstado === 4 || idEstado === 7
        ? "danger"
        : idEstado === 6
          ? "neutral"
          : "warn";
  return `<span class="badge ${clase}">${escapeHtml(estadoNombre)}</span>`;
}
