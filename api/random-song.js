export default async function handler(req, res) {
  const artistId = req.query.artist;

  if (artistId) {
    const response = await fetch(
      `https://api.deezer.com/artist/${artistId}/top?limit=50`,
    );

    const data = await response.json();
    const tracks = (data.data || []).filter((t) => t.preview);

    if (!tracks.length) {
      return res.status(404).json({ error: "No artist tracks found" });
    }

    const track = tracks[Math.floor(Math.random() * tracks.length)];

    return res.json({
      title: track.title,
      artist: track.artist?.name || "Unknown",
      preview: track.preview,
      cover: track.album?.cover_big || "",
    });
  }

  try {
    let albumId = req.query.album;

    if (!albumId || albumId === "random") {
      const chartRes = await fetch("https://api.deezer.com/chart/0/tracks");
      const chartData = await chartRes.json();

      const track =
        chartData.data[Math.floor(Math.random() * chartData.data.length)];

      return res.json({
        title: track.title,
        artist: track.artist?.name || "Unknown",
        preview: track.preview,
        cover: track.album?.cover_big || "",
      });
    }

    const response = await fetch(
      `https://api.deezer.com/album/${albumId}/tracks`,
    );

    const data = await response.json();

    const tracks = data.data.filter((t) => t.preview);

    const track = tracks[Math.floor(Math.random() * tracks.length)];

    return res.json({
      title: track.title,
      artist: track.artist.name,
      preview: track.preview,
      cover: track.album?.cover_big || "",
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
}
