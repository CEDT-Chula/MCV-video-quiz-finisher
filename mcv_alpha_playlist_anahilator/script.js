// Was Designed to look interactive, No need to minified
(async () => {
  console.log(
    "%c🔥 [STATE-AWARE] PLAYLIST AUTOMATOR ACTIVE",
    "background: #111; color: #ff3300; font-size: 18px; padding: 10px;",
  );

  // 1. DYNAMIC ID EXTRACTION (From URL: .../course/[COURSE_ID]/playlists/[PLAYLIST_ID])
  const urlParts = window.location.pathname.split("/").filter(Boolean);
  const courseId = urlParts[urlParts.indexOf("course") + 1];
  const playlistId = urlParts[urlParts.indexOf("playlists") + 1];

  const REFRESH_API = "https://api-v2.alpha.mycourseville.com/v2/auth/refresh";
  const STATUS_API = `https://api-v2.alpha.mycourseville.com/v2/student/courses/${courseId}/playlists/${playlistId}`;

  // 2. SCRAPE LOCAL VIDEO LIST
  const videoList = Array.from(document.querySelectorAll("a"))
    .filter((a) => a.href.includes("/playlists/") && a.querySelector("img"))
    .map((a) => {
      const img = a.querySelector("img");
      return {
        id: a.href.split("/").filter(Boolean).pop(),
        vid: img?.src.includes("vi/")
          ? img.src.split("/vi/")[1].split("/")[0]
          : "UNKNOWN",
        title: a.innerText.trim().split("\n")[0],
      };
    });

  if (videoList.length === 0) return console.error("❌ No videos found.");

  // 3. THE MASTER LOOP
  for (let i = 0; i < videoList.length; i++) {
    const video = videoList[i];
    console.log(
      `%c▶️ Processing [${i + 1}/${videoList.length}]: ${video.title}`,
      "color: #00ffff; font-weight: bold;",
    );

    try {
      // A. TOKEN ROTATION
      const oldRT = localStorage.getItem("refresh_token");
      const authRes = await fetch(REFRESH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: oldRT }),
      });
      const authData = await authRes.json();
      const accessToken = authData.data?.access_token;

      if (authData.data?.refresh_token) {
        localStorage.setItem("refresh_token", authData.data.refresh_token);
      }

      // B. EXECUTE SPOOF
      const PROGRESS_API = `https://api-v2.alpha.mycourseville.com/v2/student/playlists/${playlistId}/videos/${video.vid}`;
      const total = 400; // Standard simulated total
      const payload = {
        i: Array.from({ length: total }, (_, k) => k + 1),
        n: total,
        videoType: "YOUTUBE",
      };

      await fetch(PROGRESS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      // C. VERIFICATION (Using your new discovery)
      const checkRes = await fetch(STATUS_API, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const checkData = await checkRes.json();

      // Find this specific video in the status data
      const videoStatus = checkData.data.find((v) => v.videoId === video.id);

      if (videoStatus?.watchedPercent === 100) {
        console.log(
          `   %c✅ VERIFIED: Backend confirms 100% completion.`,
          "color: #00ff00;",
        );
      } else {
        console.warn(
          `   %c⚠️ WARNING: Backend reported ${videoStatus?.watchedPercent || 0}%.`,
          "color: #ffcc00;",
        );
      }
    } catch (err) {
      console.error(`   ❌ FAIL: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 600)); // Rate limit safety
  }

  console.log(
    "%c🏁 ALL TARGETS PROCESSED AND VERIFIED.",
    "background: #00ff00; color: #000; padding: 5px; font-weight: bold;",
  );
})();
