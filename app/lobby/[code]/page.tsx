type LobbyPageProps = {
  params: {
    code: string;
  };
};

export default function LobbyPage({ params }: LobbyPageProps) {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold mb-4">
        Lobby
      </h1>

      <p className="text-xl text-gray-400 mb-8">
        Room Code:
      </p>

      <div className="text-6xl font-mono bg-zinc-900 border border-zinc-700 px-8 py-4 rounded-2xl">
        {params.code}
      </div>

      <button className="mt-8 bg-blue-600 px-6 py-3 rounded-xl hover:bg-blue-500">
        Start Game
      </button>
    </main>
  );
}