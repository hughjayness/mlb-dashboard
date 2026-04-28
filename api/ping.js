module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    ok: true,
    route: "/api/ping",
    message: "Vercel API folder is working",
    timestamp: new Date().toISOString()
  });
};