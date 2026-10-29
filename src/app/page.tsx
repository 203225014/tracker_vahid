import { GameApp } from "@/components/GameApp";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Пиксельные привычки</h1>
        <p className="text-sm text-neutral-500">Выполняйте привычки, раскрашивайте картину и не дайте злу её захватить.</p>
      </header>
      <GameApp />
    </main>
  );
}
