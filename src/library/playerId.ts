export function getPlayerId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existingPlayerId =
    localStorage.getItem("hiddenparty-player-id");

  if (existingPlayerId) {
    return existingPlayerId;
  }

  const newPlayerId = crypto.randomUUID();

  localStorage.setItem(
    "hiddenparty-player-id",
    newPlayerId
  );

  return newPlayerId;
}