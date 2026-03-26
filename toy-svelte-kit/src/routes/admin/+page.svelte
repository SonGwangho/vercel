<section class="admin-gate page-shell">
  <div class="gate-card page-card">
    <p class="eyebrow page-eyebrow">Admin</p>
    <h1 class="page-title">관리자</h1>
    <code>/admin/[password]</code>
  </div>
</section>

<style>
  .admin-gate {
    min-height: 60vh;
    align-content: center;
  }

  .gate-card {
    background:
      radial-gradient(circle at top right, rgba(241, 161, 93, 0.18), transparent 28%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent) 0%, color-mix(in srgb, var(--card) 96%, transparent) 100%);
  }

  code {
    display: inline-flex;
    margin-top: 18px;
    padding: 11px 16px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface-strong) 88%, transparent);
    color: var(--brand-strong);
    font-size: 14px;
    font-weight: 700;
  }

  :global(html[data-theme="dark"]) .gate-card {
    background:
      radial-gradient(circle at top right, rgba(241, 161, 93, 0.12), transparent 28%),
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent) 0%, color-mix(in srgb, var(--card) 96%, transparent) 100%);
  }

  @media (max-width: 720px) {
    code {
      width: 100%;
      justify-content: center;
    }
  }
</style>
