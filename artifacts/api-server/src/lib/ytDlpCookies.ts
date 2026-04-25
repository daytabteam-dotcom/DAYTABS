import fs from "fs";
import path from "path";

export function setupYtDlpCookies() {
  const content = process.env.YTDLP_COOKIES_CONTENT;
  if (!content?.trim()) return;

  const cookiePath = (process.env.YTDLP_COOKIES_PATH || "/tmp/youtube-cookies.txt").trim() || "/tmp/youtube-cookies.txt";

  try {
    fs.mkdirSync(path.dirname(cookiePath), { recursive: true });
    fs.writeFileSync(cookiePath, content, { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(cookiePath, 0o600);
    } catch {
      // Best-effort (some filesystems ignore chmod).
    }
    process.env.YTDLP_COOKIES_PATH = cookiePath;
    console.log("yt-dlp cookies file created from env");
  } catch (err) {
    // Never log the cookie content.
    console.warn("yt-dlp cookies env setup failed");
  }
}

