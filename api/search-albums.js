export default async function handler(req, res) {
  const q = req.query.q;

  const response = await fetch(
    `https://api.deezer.com/search/album?q=${encodeURIComponent(q)}`,
  );

  const data = await response.json();
  res.json(data);
}
