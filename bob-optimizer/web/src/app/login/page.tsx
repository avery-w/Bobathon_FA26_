import { safeNext } from '@/lib/auth';

const MESSAGES: Record<string, string> = {
  bad: 'That code is not correct.',
  locked: 'Too many attempts. Wait a minute and try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const message = sp.error ? (MESSAGES[sp.error] ?? '') : '';
  const next = safeNext(sp.next);

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <h1 className="text-xl font-bold tracking-tight">Bob Optimizer</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter the access code printed in the terminal where you started the app.
        </p>
        <form method="post" action="/api/login" autoComplete="off" className="mt-5">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="code" className="block text-sm text-slate-300">
            Access code
          </label>
          <input
            id="code"
            name="code"
            type="password"
            required
            autoFocus
            maxLength={128}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-obsidian-950 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-sm font-bold hover:bg-blue-500 cursor-pointer"
          >
            Open Bob Optimizer
          </button>
        </form>
        <p role="alert" className="mt-3 min-h-5 text-sm text-red-400">
          {message}
        </p>
      </section>
    </main>
  );
}
