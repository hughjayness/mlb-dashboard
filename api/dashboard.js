module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    ok: true,
    route: "/api/dashboard",
    message: "dashboard.js route is working",
    view: req.query && req.query.view ? req.query.view : "none",
    timestamp: new Date().toISOString()
  });
};