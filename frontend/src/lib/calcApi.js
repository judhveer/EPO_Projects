import api from "./api";

export async function calculateItemCost(payload) {
  const { data } = await api.post("/api/fms/jobitems/calc/item", payload);
  return data;
}
