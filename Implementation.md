# Implementation Details

This document explains how each script exploits the MyCourseville platform and outlines the underlying website architecture for future improvement.

---

## 1. Website Architecture Overview

### 1.1 Classic MyCourseville (`mycourseville.com`)

MyCourseville's classic platform is built on **Drupal** and exposes server-side actions through query-string-routed AJAX endpoints.

| Layer | Detail |
|---|---|
| Routing | URL query string: `?q=<module>/<sub-path>` (Drupal's `q` parameter) |
| Video Player | Embedded **Kaltura** player (`<div id="player" data-kaltura-entryid="...">`) |
| Frontend | jQuery (`$`), standard DOM APIs |
| Session | Server-side sessions / cookies (no explicit token in JS) |
| Progress API | `?q=cvdlit/ajax/recordbar` — accepts POST with video ID and watched-interval list |
| Quiz API | `?q=cvocp/ajax/submitquizanswer` — accepts POST with quiz node ID, session token, and answer map |

Key DOM contracts relied on by the scripts:

- `cvdlit_getVideoID()` — global JS function injected by the page for video ID retrieval (falls back to `data-kaltura-entryid` attribute).
- `#cvocp-quiz-header[data-nid]` — quiz node ID.
- `#cvocp-quiz-session` — hidden `<input>` holding the server-side session token for the current quiz attempt.
- `.cvocp-quiz-item.cvocp-quiz-course-theme` — container per question.
- `div[data-part='choice-item']` — each selectable answer choice inside a question.

### 1.2 Alpha MyCourseville (`alpha.mycourseville.com`)

The Alpha platform is a **React SPA** backed by a proper **REST API** hosted at `api-v2.alpha.mycourseville.com/v2/`.

| Layer | Detail |
|---|---|
| Routing | Clean REST paths: `/v2/student/courses/:courseId/playlists/:playlistId` |
| Authentication | Short-lived **JWT access token** + **refresh token** stored in `localStorage` (`refresh_token`) |
| Video Player | **YouTube** embeds; video IDs scraped from thumbnail `src` (`vi/<videoId>/`) |
| Progress API | `POST /v2/student/playlists/:playlistId/videos/:videoId` — `Authorization: Bearer <token>` |
| Status API | `GET /v2/student/courses/:courseId/playlists/:playlistId` — returns per-video `watchedPercent` |
| Token Refresh | `POST /v2/auth/refresh` — exchanges old `refresh_token` for a new access+refresh pair |

---

## 2. Exploitation Details

### 2.1 Video Finisher (`video_finisher/script.js`)

**Target:** Classic MyCourseville video progress tracking.

**How it works:**

1. **Identify the video ID** — The script first tries the page-global helper `cvdlit_getVideoID()`. If that is not defined (some pages omit it), it falls back to reading `data-kaltura-entryid` directly from the Kaltura player `<div>`.

2. **Fake a full watch** — Kaltura progress is reported to the server as a list of "watched intervals" (integer indices). The script constructs a `URLSearchParams` payload with:
   - `v` — the video ID
   - `type` — hardcoded `"kaltura"`
   - `n` — `400` (number of intervals)
   - `i` — a JSON-encoded array `[0, 1, 2, …, 399]` representing every interval out of 400

3. **POST to the progress endpoint** — `fetch("?q=cvdlit/ajax/recordbar", { method: "POST", body: data })`. Because the request is made from within the same origin (the browser already has a valid session cookie), it is authenticated automatically.

4. **Retry once** — The loop runs at most twice. If the server returns `status == 1` on either attempt, an "success" alert is shown and the function returns. If both attempts fail, "failed, try again" is shown.

**Why it works:**

The server accepts the interval list without verifying it was produced by real playback events. Submitting all 400 intervals at once fools the server into believing the video was watched in its entirety.

---

### 2.2 Quiz Finisher (`quiz_finisher/script.js`)

**Target:** Classic MyCourseville multiple-choice quizzes.

**How it works:**

1. **Discover all questions** — `document.querySelectorAll(".cvocp-quiz-item.cvocp-quiz-course-theme")` returns every question block on the page.

2. **Build an answer index** — For each question (keyed by `dataset.qstnNid`):
   - Collect the `value` attribute of every `choice-qstn-<nid>-<index>` input element into `answers[nid]`.
   - Initialize the "current guess index" `o[nid] = 0`.

3. **Submit and evaluate (brute-force loop)**:
   - The inner async function `l(guesses)` builds a POST payload for `?q=cvocp/ajax/submitquizanswer` containing:
     - `nid` — quiz node ID from `#cvocp-quiz-header`
     - `sid` — current session token from `#cvocp-quiz-session`
     - `answer_<nid>` — the value of the currently guessed choice for each question
   - It also `.click()`s the selected radio/checkbox in the DOM to keep the UI in sync.
   - The server response includes a `result` map (`{ <nid>: "0" | "1" }`) and the current `score` vs `scoretotal`.

4. **Advance wrong answers** — For each question where the result is `"0"` (wrong), the guess index `o[nid]` is incremented, so the next submission tries the next choice.

5. **Stop when perfect** — The outer loop runs up to `t` times (where `t` is the number of choices per question). If `score == scoretotal`, the UI is updated (crosses hidden, checks shown) and an "done" alert fires.

**Why it works:**

The quiz submission endpoint does not limit the number of attempts or add a delay between submissions, and it reveals per-question correctness in the response. This allows systematic elimination: at worst, the script needs one submission per wrong answer per question (i.e., `choices - 1` rounds in the worst case).

---

### 2.3 MCV Alpha Playlist Annihilator (`mcv_alpha_playlist_anahilator/script.js`)

**Target:** Alpha MyCourseville playlist video completion.

**How it works:**

1. **Extract IDs from the URL** — The course ID and playlist ID are parsed from `window.location.pathname` by looking for segments after `"course"` and `"playlists"` respectively.

2. **Scrape the video list from the DOM** — All `<a>` tags whose `href` contains `/playlists/` and that contain an `<img>` child are collected. From each:
   - `id` — last path segment of the link `href` (internal playlist-item ID)
   - `vid` — YouTube video ID extracted from the thumbnail `src` (`vi/<videoId>/`)
   - `title` — visible text of the link

3. **Process each video in sequence:**

   **A. Token rotation** — Before every request, a fresh access token is obtained by `POST`ing the current `localStorage.refresh_token` to `/v2/auth/refresh`. The new `refresh_token` is stored back to `localStorage`. This avoids token expiry mid-loop.

   **B. Fake progress submission** — A `POST` is sent to `/v2/student/playlists/:playlistId/videos/:vid` with:
     - `i` — array `[1, 2, …, 400]` (all 400 intervals)
     - `n` — `400`
     - `videoType` — `"YOUTUBE"`
     - `Authorization: Bearer <accessToken>` header

   **C. Verification** — A `GET` to the playlist status endpoint confirms `watchedPercent === 100` for the video. A warning is logged if the backend hasn't updated yet.

4. **Rate-limit safety** — A 600 ms `setTimeout` pause is inserted between videos to avoid flooding the API.

**Why it works:**

Like the classic video finisher, the Alpha API accepts an arbitrary interval array without validating it against real playback telemetry. Providing all 400 intervals in one POST marks the video as 100% watched. The per-request token refresh ensures the short-lived JWT never expires during a long playlist.

---

## 3. Architecture Comparison

| Feature | Classic MCV | Alpha MCV |
|---|---|---|
| Base URL | `mycourseville.com` | `alpha.mycourseville.com` |
| Backend framework | Drupal (PHP) | Node.js / REST API |
| API style | Drupal `?q=` routing | REST (`/v2/...`) |
| Auth mechanism | Server-side session cookie | JWT (access + refresh token) |
| Token storage | Browser cookie (implicit) | `localStorage` |
| Video platform | Kaltura | YouTube |
| Progress payload | Form-encoded (`URLSearchParams`) | JSON body |
| Quiz result in response | Per-question `result` map | N/A (no quiz API yet) |

---

## 4. Future Improvement Suggestions

### 4.1 Unified Entry Point
Create a single bookmarklet / browser extension that auto-detects whether the current page is Classic MCV or Alpha MCV (by hostname) and dispatches to the appropriate script.

### 4.2 Browser Extension
Package the scripts as a **Manifest V3 Chrome/Firefox extension** with:
- A popup UI for triggering each tool.
- Persistent storage for tokens instead of relying on `localStorage`.
- Background service worker for token refresh without page reload.

### 4.3 Playlist Support for Classic MCV
The classic video finisher only operates on a single open video page. A playlist annihilator equivalent could:
1. Enumerate all video nodes on a course page.
2. Fetch each video's Kaltura ID via the existing DOM or the Drupal API.
3. Call `recordbar` for each video sequentially (with rate-limit delays).

### 4.4 Quiz Finisher for Alpha MCV
If the Alpha platform ever introduces quizzes, the same brute-force strategy should work against its REST quiz endpoint — substitute the Drupal `submitquizanswer` POST with the corresponding `/v2/student/.../quiz` endpoint and re-use the JWT header pattern from the playlist annihilator.

### 4.5 Hardening Against Anti-Automation
Future platform changes may add:
- **Interval validation** — checking that reported intervals are dense, contiguous, and match the actual video duration. Mitigation: compute intervals dynamically from a real-duration API call instead of hardcoding 400.
- **Rate limiting / CAPTCHA** — add randomized delays and human-like submission timing.
- **Attempt limits on quizzes** — store seen wrong answers locally and skip already-failed choices on re-run.

### 4.6 Error Handling & Logging
The current scripts surface errors only via `alert()` or `console.error()`. A shared utility module could provide:
- Structured error codes.
- A DOM-injected status overlay (avoiding reliance on `alert()`).
- Per-video / per-question retry logic with exponential back-off.
