const express = require("express");
const { Resend } = require("resend");
const cors = require("cors");

const app = express();
app.use(express.json());

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
  })
);

// Keep-alive endpoint — hit this every 10 min via cron-job.org to prevent sleep
app.get("/ping", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.post("/send-email", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { name, phone, email, service, category, message, mailTo } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required" });
  }

  const { RESEND_API_KEY, RESEND_FROM, MAIL_TO } = process.env;
  const recipient = mailTo || MAIL_TO;

  if (!RESEND_API_KEY || !recipient) {
    console.error("[email-service] RESEND_API_KEY or recipient missing");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const resend = new Resend(RESEND_API_KEY);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#0D47A1;color:#fff;padding:18px 24px">
        <h2 style="margin:0">New Shipment Request - ZSM Transport Agency</h2>
      </div>
      <div style="padding:24px;color:#1e293b">
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || "—")}</p>
        <p><strong>Service Requested:</strong> ${escapeHtml(service || "—")}</p>
        <p><strong>Product Category:</strong> ${escapeHtml(category || "—")}</p>
        <p><strong>Message:</strong><br/>${escapeHtml(message || "—").replace(/\n/g, "<br/>")}</p>
      </div>
      <div style="background:#f1f5f9;padding:12px 24px;font-size:12px;color:#64748b">
        Sent from ZSM Transport Agency's Website.
      </div>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM || "ZSM Transport Agency <onboarding@resend.dev>",
      to: recipient,
      replyTo: email || undefined,
      subject: `New Delivery Request from ${name}`,
      text: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nService: ${service}\nProduct Category: ${category}\nMessage: ${message}`,
      html,
    });

    if (error) {
      console.error("[email-service] Resend error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[email-service] Email sent for: ${name}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[email-service] send error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ZSM Email Service running on port ${PORT}`));

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
