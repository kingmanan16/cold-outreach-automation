export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const hasError = searchParams.error === "1";

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-login-glow">
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.07]" />
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl animate-soft-pulse" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col justify-center gap-10 px-6 py-16 lg:flex-row lg:items-center lg:gap-20 lg:px-10">
        <div className="max-w-md animate-fade-up text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200/80">
            Sequence control
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Cold Outreach
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Run your 4-mail sequences across mailboxes — track every follow-up,
            pace daily sends, and stop automatically when someone replies.
          </p>
        </div>

        <div className="w-full max-w-md animate-fade-up rounded-2xl border border-white/10 bg-white/95 p-7 shadow-lift backdrop-blur-sm">
          <h2 className="font-display text-xl font-semibold text-ink">
            Sign in
          </h2>
          <p className="mt-1 text-sm text-ink-mute">
            Operator: leave email blank + app password. Team: email + password.
          </p>

          <form action="/api/login" method="post" className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-ink-soft"
              >
                Email{" "}
                <span className="font-normal text-ink-mute">(team users)</span>
              </label>
              <input
                id="email"
                name="email"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="Leave blank for operator"
                className="field-input"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-ink-soft"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                className="field-input"
              />
            </div>
            {hasError && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                Incorrect credentials.
              </p>
            )}
            <button type="submit" className="btn-primary w-full py-2.5">
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
