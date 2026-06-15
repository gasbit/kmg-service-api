export function buildTransactionNo(sequence: number, date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `TX-${yyyy}${mm}${dd}-${String(sequence).padStart(4, "0")}`;
}
