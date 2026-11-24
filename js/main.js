(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};
  var FOLDER = (cfg.imagesFolder || "images").replace(/^\/+|\/+$/g, "");
  var IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
  var CACHE_KEY = "gallery-cache-v1";
  var CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // Natural ascending sort: "img2" comes before "img10", case-insensitive.
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  /* ---------- Where are we hosted? ---------- */
  function detectRepo() {
    if (cfg.githubOwner && cfg.githubRepo) {
      return { owner: cfg.githubOwner, repo: cfg.githubRepo };
    }
    var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    var owner = m[1];
    var first = location.pathname.split("/").filter(Boolean)[0];
    // Project site: owner.github.io/<repo>/   User site: owner.github.io/
    var repo = first && first.indexOf(".") === -1 ? first : owner + ".github.io";
    return { owner: owner, repo: repo };
  }

  /* ---------- Image sources ---------- */
  function fromGitHub(repo) {
    var url = "https://api.github.com/repos/" + repo.owner + "/" + repo.repo +
      "/contents/" + FOLDER + (cfg.githubBranch ? "?ref=" + encodeURIComponent(cfg.githubBranch) : "");
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("GitHub API " + r.status);
        return r.json();
      })
      .then(function (items) {
        return items
          .filter(function (f) { return f.type === "file" && IMAGE_EXT.test(f.name); })
          .map(function (f) { return f.name; });
      });
  }

  function fromManifest() {
    return fetch(FOLDER + "/images.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("No images.json");
        return r.json();
      })
      .then(function (list) {
        return (Array.isArray(list) ? list : [])
          .map(function (n) { return String(n).split("/").pop(); })
          .filter(function (n) { return IMAGE_EXT.test(n); });
      });
  }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.t < CACHE_TTL && Array.isArray(c.names)) return c.names;
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function writeCache(names) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), names: names })); } catch (e) {}
  }

  function loadImageNames() {
    var cached = readCache();
    if (cached) return Promise.resolve(cached);
    var repo = detectRepo();
    var primary = repo ? fromGitHub(repo).catch(fromManifest) : fromManifest();
    return primary.then(function (names) {
      if (repo && names.length) writeCache(names);
      return names;
    });
  }

  /* ---------- Helpers ---------- */
  function captionFrom(name) {
    // "03_living-room.jpg" -> "Living room";  "IMG-20240411-WA0010.jpg" -> ""
    var base = name.replace(/\.[^.]+$/, "");
    if (/^(img|dsc|pxl|wa|photo)?[-_ ]?\d[\d_ -]*(wa\d+)?$/i.test(base) || /^IMG[-_]\d/i.test(base)) return "";
    var text = base.replace(/^\d+[\s._-]*/, "").replace(/[-_]+/g, " ").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }
  function srcFor(name) { return FOLDER + "/" + encodeURIComponent(name); }

  /* ---------- Gallery ---------- */
  var gallery = document.getElementById("gallery");
  var photos = [];

  function render(names) {
    names.sort(collator.compare);
    photos = names.map(function (n) { return { src: srcFor(n), caption: captionFrom(n) }; });

    if (!photos.length) {
      gallery.innerHTML = '<p class="gallery-status">Project photos are coming soon.</p>';
      return;
    }

    var hero = cfg.heroImage || photos[0].src;
    // Resolve against the page (not the stylesheet) so relative paths work.
    var heroUrl = new URL(hero, document.baseURI).href;
    document.getElementById("hero").style.setProperty("--hero-img", 'url("' + heroUrl + '")');

    var frag = document.createDocumentFragment();
    photos.forEach(function (p, i) {
      var btn = document.createElement("button");
      btn.className = "gallery-item";
      btn.type = "button";
      btn.setAttribute("data-caption", p.caption);
      btn.setAttribute("aria-label", "Open photo " + (i + 1) + (p.caption ? ": " + p.caption : ""));
      var img = document.createElement("img");
      img.loading = i < 6 ? "eager" : "lazy";
      img.decoding = "async";
      img.alt = p.caption || "Interior design project by Grid Line Designers, photo " + (i + 1);
      img.onload = function () { img.classList.add("loaded"); };
      img.src = p.src;
      btn.appendChild(img);
      btn.addEventListener("click", function () { openLightbox(i); });
      frag.appendChild(btn);
    });
    gallery.innerHTML = "";
    gallery.appendChild(frag);
  }

  loadImageNames()
    .then(render)
    .catch(function () {
      gallery.innerHTML = '<p class="gallery-status">Project photos could not be loaded right now. Please refresh the page.</p>';
    });

  /* ---------- Lightbox ---------- */
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbCap = document.getElementById("lb-caption");
  var current = 0, lastFocus = null;

  function show(i) {
    current = (i + photos.length) % photos.length;
    var p = photos[current];
    lbImg.src = p.src;
    lbImg.alt = p.caption || "Project photo " + (current + 1);
    lbCap.textContent = (p.caption ? p.caption + "  ·  " : "") + (current + 1) + " / " + photos.length;
    [1, -1].forEach(function (d) { new Image().src = photos[(current + d + photos.length) % photos.length].src; });
  }
  function openLightbox(i) {
    lastFocus = document.activeElement;
    show(i);
    lb.hidden = false;
    document.body.classList.add("no-scroll");
    lb.querySelector(".lb-close").focus();
  }
  function closeLightbox() {
    lb.hidden = true;
    document.body.classList.remove("no-scroll");
    if (lastFocus) lastFocus.focus();
  }

  lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
  lb.querySelector(".lb-prev").addEventListener("click", function () { show(current - 1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { show(current + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "ArrowLeft") show(current - 1);
  });
  var touchX = null;
  lb.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- Header & nav ---------- */
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  function onScroll() { header.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toggle.addEventListener("click", function () {
    var open = header.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".site-nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      header.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
