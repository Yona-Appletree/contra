import { Button } from "@caller/ui-base";

const appVersion = import.meta.env.VITE_APP_VERSION ?? "dev";

export function App() {
  const base = import.meta.env.BASE_URL;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold">Contra hall — coming soon</h1>
      <div className="flex gap-4">
        <Button asChild>
          <a href={`${base}spikes/hall/`}>Hall spike</a>
        </Button>
        <Button asChild variant="secondary">
          <a href={`${base}spikes/two-dancers/`}>Two-dancers spike</a>
        </Button>
      </div>
      <footer className="mt-12 text-sm text-muted-foreground">{appVersion}</footer>
    </main>
  );
}
