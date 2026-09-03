const ID_KEY = "gmd_client_id";
const NAME_KEY = "gmd_player_name";

export function getClientId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id =
      crypto.randomUUID?.() ??
      `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) || "";
}

export function saveName(name) {
  localStorage.setItem(NAME_KEY, name.trim());
}
