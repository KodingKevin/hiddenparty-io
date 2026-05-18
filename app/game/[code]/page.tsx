type GamePageProps = {
  params: Promise<{
    code: string;
  }>;
};

import { use } from "react";

export default function GamePage({ params }: GamePageProps) {
  const { code } = use(params);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold mb-4">
        Game Started
      </h1>

      <p className="text-xl text-gray-400">
        Room Code: {code}
      </p>
    </main>
  );
}