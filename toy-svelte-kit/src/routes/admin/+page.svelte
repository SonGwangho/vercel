<section class="admin-gate">
  <div class="gate-card">
    <p class="eyebrow">Admin</p>
    <h1>관리자 전용 페이지</h1>
    <p class="description">
      이 화면은 URL 파라미터에 관리자 암호가 포함되어야 열립니다.
    </p>
    <code>/admin/[password]</code>
  </div>
</section>

<style>
  .admin-gate {
    display: grid;
    place-items: center;
    min-height: 60vh;
    padding: 24px 0 40px;
  }

  .gate-card {
    width: min(100%, 640px);
    padding: 28px;
    border-radius: 28px;
    border: 1px solid #dbe4ef;
    background:
      radial-gradient(circle at top right, rgba(245, 158, 11, 0.22), transparent 28%),
      linear-gradient(180deg, #fffaf0 0%, #ffffff 100%);
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  }

  .eyebrow {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #b45309;
  }

  h1 {
    margin: 0;
    font-size: clamp(32px, 5vw, 44px);
    line-height: 1.05;
    color: #111827;
  }

  .description {
    margin: 14px 0 0;
    font-size: 16px;
    line-height: 1.6;
    color: #4b5563;
  }

  code {
    display: inline-flex;
    margin-top: 18px;
    padding: 10px 14px;
    border-radius: 999px;
    background: #111827;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
  }

  :global(html[data-theme="dark"]) .admin-gate .gate-card {
    border-color: rgba(255, 255, 255, 0.08);
    background:
      radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 28%),
      linear-gradient(180deg, #1f2937 0%, #111827 100%);
  }

  :global(html[data-theme="dark"]) .admin-gate .eyebrow {
    color: #fbbf24;
  }

  :global(html[data-theme="dark"]) .admin-gate h1 {
    color: #f9fafb;
  }

  :global(html[data-theme="dark"]) .admin-gate .description {
    color: #d1d5db;
  }

  :global(html[data-theme="dark"]) .admin-gate code {
    background: #f59e0b;
    color: #111827;
  }
</style>
