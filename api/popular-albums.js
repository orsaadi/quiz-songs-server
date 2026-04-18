export default async function handler(req, res) {
  const response = await fetch("https://api.deezer.com/chart/0/albums");
  const data = await response.json();
  res.json(data);
}
