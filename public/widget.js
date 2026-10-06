/*
 * Concierge chat widget loader. Add to any site:
 *
 *   <script src="https://YOUR-DOMAIN/widget.js"
 *           data-customer-email="jane@example.com"   (optional, signed-in user)
 *           data-customer-name="Jane"                 (optional)
 *           async></script>
 */
(function () {
  if (window.__conciergeLoaded) return;
  window.__conciergeLoaded = true;

  var script =
    document.currentScript || document.querySelector('script[src*="widget.js"]');
  var origin = new URL(script.src, window.location.href).origin;
  var params = new URLSearchParams({ embedded: "1" });
  if (script.dataset.customerEmail) params.set("email", script.dataset.customerEmail);
  if (script.dataset.customerName) params.set("name", script.dataset.customerName);

  var open = false;
  var frame = document.createElement("iframe");
  frame.src = origin + "/widget?" + params.toString();
  frame.title = "Support chat";
  frame.allow = "clipboard-write";
  Object.assign(frame.style, {
    position: "fixed",
    right: "20px",
    bottom: "92px",
    width: "390px",
    height: "min(640px, calc(100vh - 120px))",
    border: "0",
    borderRadius: "16px",
    boxShadow: "0 12px 48px rgba(15, 23, 42, 0.22)",
    zIndex: "2147483646",
    display: "none",
    background: "#fff",
  });

  var button = document.createElement("button");
  button.setAttribute("aria-label", "Open support chat");
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "58px",
    height: "58px",
    borderRadius: "50%",
    border: "0",
    cursor: "pointer",
    background: "#4f46e5",
    color: "#fff",
    boxShadow: "0 6px 24px rgba(15, 23, 42, 0.25)",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform .15s ease",
  });
  var chatIcon =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  button.innerHTML = chatIcon;

  function layout() {
    var small = window.innerWidth < 480;
    Object.assign(
      frame.style,
      small
        ? { right: "0", bottom: "0", width: "100vw", height: "100dvh", borderRadius: "0" }
        : { right: "20px", bottom: "92px", width: "390px", height: "min(640px, calc(100vh - 120px))", borderRadius: "16px" }
    );
    button.style.display = small && open ? "none" : "flex";
  }

  function toggle(next) {
    open = typeof next === "boolean" ? next : !open;
    frame.style.display = open ? "block" : "none";
    button.innerHTML = open ? closeIcon : chatIcon;
    button.setAttribute("aria-label", open ? "Close support chat" : "Open support chat");
    layout();
  }

  button.addEventListener("click", function () { toggle(); });
  window.addEventListener("resize", layout);
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data && e.data.type === "concierge:close") toggle(false);
  });

  fetch(origin + "/api/widget-config")
    .then(function (r) { return r.json(); })
    .then(function (c) { if (c.brandColor) button.style.background = c.brandColor; })
    .catch(function () {});

  document.body.appendChild(frame);
  document.body.appendChild(button);
  layout();
})();
