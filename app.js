(() => {
  const { origin, spots } = window.KYOTO_AUTUMN_DATA;

  const RANK_LABELS = {
    S: "S：絶対に行くべき名所",
    A: "A：ぜひ行きたい名所",
    B: "B：道中などで寄りたい名所"
  };

  const RANK_ORDER = { S: 1, A: 2, B: 3 };

  // ==========================================
  // 距離（km）と方角（8方位）の計算
  // ==========================================
  function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calcDirection(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const dirs = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
    return dirs[Math.round(bearing / 45) % 8];
  }

  function hasNightViewing(spot) {
    return spot.nightViewing && (
      spot.nightViewing.includes("夜間") ||
      spot.nightViewing.includes("ライトアップ")
    );
  }

  const enrichedSpots = spots.map((s) => {
    const distanceKm = calcDistanceKm(origin.lat, origin.lng, s.lat, s.lng);
    const direction = calcDirection(origin.lat, origin.lng, s.lat, s.lng);
    return {
      ...s,
      distanceKm,
      direction,
      isNight: hasNightViewing(s)
    };
  });

  // ==========================================
  // DOM要素
  // ==========================================
  const searchInput = document.getElementById("searchInput");
  const rankFiltersEl = document.getElementById("rankFilters");
  const areaSelect = document.getElementById("areaSelect");
  const distanceSelect = document.getElementById("distanceSelect");
  const sortSelect = document.getElementById("sortSelect");
  const nightOnlyCheck = document.getElementById("nightOnlyCheck");
  const railwaysCheck = document.getElementById("railwaysCheck");
  const stationCompanyBar = document.getElementById("stationCompanyBar");
  const circlesCheck = document.getElementById("circlesCheck");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const spotListEl = document.getElementById("spotList");
  const visibleCountEl = document.getElementById("visibleCount");
  const totalCountEl = document.getElementById("totalCount");
  const countSEl = document.getElementById("countS");
  const countAEl = document.getElementById("countA");
  const countBEl = document.getElementById("countB");
  const appShell = document.querySelector(".app-shell");
  const controlsPanel = document.querySelector(".controls-panel");
  const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
  const mobileTabBar = document.getElementById("mobileTabBar");
  const mobileTabCountEl = document.getElementById("mobileTabCount");
  const locateMeBtn = document.getElementById("locateMeBtn");
  const mapLegend = document.getElementById("mapLegend");
  const legendToggleBtn = document.getElementById("legendToggleBtn");
  const focusOriginBtn = document.getElementById("focusOriginBtn");
  const fitKyotoBtn = document.getElementById("fitKyotoBtn");

  // 状態管理（初期表示は出町柳駅から20km以内）
  const state = {
    ranks: new Set(["S", "A", "B"]),
    area: "ALL",
    maxDistanceKm: 20,
    sort: "rank",
    search: "",
    nightOnly: false,
    stationCompanies: new Set(["keihan", "hankyu", "jr", "eiden"]),
    selectedId: null
  };

  // エリア選択肢を生成
  const uniqueAreas = Array.from(new Set(enrichedSpots.map((s) => s.area)));
  uniqueAreas.forEach((area) => {
    const opt = document.createElement("option");
    opt.value = area;
    opt.textContent = area;
    areaSelect.appendChild(opt);
  });

  function updateSummaryCounts() {
    const basePool =
      state.maxDistanceKm === "ALL"
        ? enrichedSpots
        : enrichedSpots.filter((s) => s.distanceKm <= state.maxDistanceKm);

    totalCountEl.textContent = basePool.length;
    countSEl.textContent = basePool.filter((s) => s.rank === "S").length;
    countAEl.textContent = basePool.filter((s) => s.rank === "A").length;
    countBEl.textContent = basePool.filter((s) => s.rank === "B").length;
  }

  updateSummaryCounts();

  // ==========================================
  // Leaflet 地図の初期化
  // ==========================================
  const map = L.map("map", {
    center: [origin.lat, origin.lng],
    zoom: 12,
    zoomControl: true
  });

  // APIキー不要の地図タイル（国土地理院・OpenStreetMap）
  const simpleMonoGsiLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    {
      attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>",
      className: "tile-simple-mono",
      maxZoom: 18
    }
  );

  const blankGsiLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png",
    {
      attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>",
      maxNativeZoom: 14,
      maxZoom: 18
    }
  );

  const gsiPaleLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    {
      attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>",
      maxZoom: 18
    }
  );

  const osmLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }
  );

  simpleMonoGsiLayer.addTo(map);

  L.control
    .layers(
      {
        "シンプル地図（モノクロ・標準）": simpleMonoGsiLayer,
        "超簡素白地図（国土地理院）": blankGsiLayer,
        "淡色地図（国土地理院）": gsiPaleLayer,
        "OpenStreetMap": osmLayer
      },
      null,
      { position: "bottomleft" }
    )
    .addTo(map);

  // 主要路線（京阪・阪急・JR）の描画
  const railwaysGroup = L.layerGroup().addTo(map);

  const RAILWAYS = [
    {
      company: "keihan",
      name: "京阪本線・鴨東線",
      color: "#007a33",
      stations: [
        { name: "出町柳", lat: 35.0303, lng: 135.7725, major: true },
        { name: "神宮丸太町", lat: 35.0175, lng: 135.7722 },
        { name: "三条", lat: 35.0091, lng: 135.7725, major: true },
        { name: "祇園四条", lat: 35.0038, lng: 135.7720, major: true },
        { name: "清水五条", lat: 34.9958, lng: 135.7689 },
        { name: "七条", lat: 34.9896, lng: 135.7676 },
        { name: "東福寺", lat: 34.9814, lng: 135.7702 },
        { name: "鳥羽街道", lat: 34.9722, lng: 135.7697 },
        { name: "伏見稲荷", lat: 34.9672, lng: 135.7690 },
        { name: "丹波橋", lat: 34.9389, lng: 135.7652 },
        { name: "中書島", lat: 34.9267, lng: 135.7604, major: true },
        { name: "石清水八幡宮", lat: 34.8842, lng: 135.7003, major: true }
      ]
    },
    {
      company: "keihan",
      name: "京阪宇治線",
      color: "#007a33",
      stations: [
        { name: "中書島", lat: 34.9267, lng: 135.7604 },
        { name: "六地蔵", lat: 34.9325, lng: 135.7945 },
        { name: "木幡", lat: 34.9219, lng: 135.8007 },
        { name: "黄檗", lat: 34.9136, lng: 135.8027 },
        { name: "宇治(京阪)", lat: 34.8926, lng: 135.8056, major: true }
      ]
    },
    {
      company: "hankyu",
      name: "阪急京都線",
      color: "#6c1d45",
      stations: [
        { name: "京都河原町", lat: 35.0037, lng: 135.7688, major: true },
        { name: "烏丸", lat: 35.0037, lng: 135.7595, major: true },
        { name: "大宮", lat: 35.0037, lng: 135.7489 },
        { name: "西院", lat: 35.0037, lng: 135.7318 },
        { name: "西京極", lat: 34.9917, lng: 135.7183 },
        { name: "桂", lat: 34.9794, lng: 135.7029, major: true },
        { name: "洛西口", lat: 34.9647, lng: 135.7024 },
        { name: "東向日", lat: 34.9519, lng: 135.7026 },
        { name: "西向日", lat: 34.9404, lng: 135.6997 },
        { name: "長岡天神", lat: 34.9245, lng: 135.6929, major: true },
        { name: "西山天王山", lat: 34.9098, lng: 135.6844 },
        { name: "大山崎", lat: 34.8922, lng: 135.6808 }
      ]
    },
    {
      company: "hankyu",
      name: "阪急嵐山線",
      color: "#6c1d45",
      stations: [
        { name: "桂", lat: 34.9794, lng: 135.7029 },
        { name: "上桂", lat: 34.9901, lng: 135.6948 },
        { name: "松尾大社", lat: 35.0005, lng: 135.6887 },
        { name: "嵐山(阪急)", lat: 35.0103, lng: 135.6820, major: true }
      ]
    },
    {
      company: "jr",
      name: "JR京都線・琵琶湖線",
      color: "#0072bc",
      stations: [
        { name: "山科", lat: 34.9923, lng: 135.8170, major: true },
        { name: "京都", lat: 34.9858, lng: 135.7588, major: true },
        { name: "西大路", lat: 34.9813, lng: 135.7327 },
        { name: "桂川", lat: 34.9646, lng: 135.7097 },
        { name: "向日町", lat: 34.9531, lng: 135.7068 },
        { name: "長岡京", lat: 34.9245, lng: 135.7011 },
        { name: "山崎", lat: 34.8923, lng: 135.6789 }
      ]
    },
    {
      company: "jr",
      name: "JR嵯峨野線（山陰本線）",
      color: "#0072bc",
      stations: [
        { name: "京都", lat: 34.9858, lng: 135.7588 },
        { name: "梅小路京都西", lat: 34.9891, lng: 135.7433 },
        { name: "丹波口", lat: 34.9958, lng: 135.7429 },
        { name: "二条", lat: 35.0104, lng: 135.7417, major: true },
        { name: "円町", lat: 35.0176, lng: 135.7322 },
        { name: "花園", lat: 35.0221, lng: 135.7186 },
        { name: "太秦", lat: 35.0209, lng: 135.6997 },
        { name: "嵯峨嵐山", lat: 35.0185, lng: 135.6812, major: true },
        { name: "保津峡(JR)", lat: 35.0273, lng: 135.6386 },
        { name: "馬堀", lat: 35.0265, lng: 135.5884 },
        { name: "亀岡", lat: 35.0169, lng: 135.5819, major: true }
      ]
    },
    {
      company: "jr",
      name: "JR奈良線",
      color: "#0072bc",
      stations: [
        { name: "京都", lat: 34.9858, lng: 135.7588 },
        { name: "東福寺(JR)", lat: 34.9814, lng: 135.7702 },
        { name: "稲荷", lat: 34.9672, lng: 135.7708 },
        { name: "JR藤森", lat: 34.9488, lng: 135.7745 },
        { name: "桃山", lat: 34.9325, lng: 135.7701 },
        { name: "六地蔵(JR)", lat: 34.9325, lng: 135.7945 },
        { name: "木幡(JR)", lat: 34.9225, lng: 135.8021 },
        { name: "黄檗(JR)", lat: 34.9141, lng: 135.8047 },
        { name: "宇治(JR)", lat: 34.8904, lng: 135.8007, major: true }
      ]
    },
    {
      company: "eiden",
      name: "叡山電鉄 叡山本線",
      color: "#6b4c9a",
      stations: [
        { name: "出町柳", lat: 35.0303, lng: 135.7725, major: true },
        { name: "元田中", lat: 35.0365, lng: 135.7797 },
        { name: "茶山・京都芸術大学", lat: 35.0419, lng: 135.7836 },
        { name: "一乗寺", lat: 35.0454, lng: 135.7867, major: true },
        { name: "修学院", lat: 35.0510, lng: 135.7905, major: true },
        { name: "宝ケ池", lat: 35.0574, lng: 135.7903 },
        { name: "三宅八幡", lat: 35.0602, lng: 135.8000 },
        { name: "八瀬比叡山口", lat: 35.0628, lng: 135.8141, major: true }
      ]
    },
    {
      company: "eiden",
      name: "叡山電鉄 鞍馬線",
      color: "#6b4c9a",
      stations: [
        { name: "宝ケ池", lat: 35.0574, lng: 135.7903 },
        { name: "八幡前", lat: 35.0642, lng: 135.7848 },
        { name: "岩倉", lat: 35.0706, lng: 135.7796, major: true },
        { name: "木野", lat: 35.0736, lng: 135.7720 },
        { name: "京都精華大前", lat: 35.0757, lng: 135.7662 },
        { name: "二軒茶屋", lat: 35.0764, lng: 135.7600 },
        { name: "市原", lat: 35.0815, lng: 135.7609 },
        { name: "二ノ瀬", lat: 35.0928, lng: 135.7688 },
        { name: "貴船口", lat: 35.1072, lng: 135.7666, major: true },
        { name: "鞍馬", lat: 35.1157, lng: 135.7722, major: true }
      ]
    }
  ];

  function renderRailways() {
    railwaysGroup.clearLayers();
    stationCompanyBar.classList.toggle("disabled", !railwaysCheck.checked);
    if (!railwaysCheck.checked) return;

    const labeledStations = new Set();

    RAILWAYS.forEach((line) => {
      if (!state.stationCompanies.has(line.company)) return;
      // 駅マーカー（駅間の直線は描画せず駅位置のみ表示）
      line.stations.forEach((st) => {
        L.circleMarker([st.lat, st.lng], {
          radius: st.major ? 5.5 : 3.8,
          color: line.color,
          weight: 2.2,
          fillColor: "#ffffff",
          fillOpacity: 1
        })
          .bindTooltip(`${st.name}駅（${line.name}）`)
          .addTo(railwaysGroup);

        if (st.major && !labeledStations.has(st.name)) {
          labeledStations.add(st.name);
          L.marker([st.lat, st.lng], {
            interactive: false,
            zIndexOffset: 50,
            icon: L.divIcon({
              className: "custom-pin-wrapper",
              html: `<span class="station-label">${st.name}</span>`,
              iconSize: [70, 18],
              iconAnchor: [-7, 9]
            })
          }).addTo(railwaysGroup);
        }
      });
    });
  }

  renderRailways();

  // 距離ガイド（同心円）
  const circlesGroup = L.layerGroup().addTo(map);

  function renderDistanceCircles() {
    circlesGroup.clearLayers();
    if (!circlesCheck.checked) return;

    const circleRadiiKm =
      state.maxDistanceKm === "ALL" ? [2, 5, 10, 20, 40] : [2, 5, 10, 20];

    circleRadiiKm.forEach((km) => {
      L.circle([origin.lat, origin.lng], {
        radius: km * 1000,
        color: "#1e4b8a",
        weight: 1,
        opacity: 0.35,
        dashArray: "5, 6",
        fill: false,
        interactive: false
      }).addTo(circlesGroup);

      // 円の北端に距離ラベルを配置（1度あたり約111.32km）
      const labelLat = origin.lat + km / 111.32;
      L.marker([labelLat, origin.lng], {
        interactive: false,
        icon: L.divIcon({
          className: "custom-pin-wrapper",
          html: `<span class="circle-label">${km}km</span>`,
          iconSize: [38, 18],
          iconAnchor: [19, 9]
        })
      }).addTo(circlesGroup);
    });
  }

  renderDistanceCircles();

  // スポット用マーカー管理
  const markersLayer = L.layerGroup().addTo(map);
  const markerById = new Map();

  function createSpotIcon(rank) {
    const cls = rank === "S" ? "pin-s" : rank === "A" ? "pin-a" : "pin-b";
    const size = rank === "S" ? 28 : rank === "A" ? 22 : 17;
    return L.divIcon({
      className: "custom-pin-wrapper",
      html: `<div class="${cls}">${rank}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function buildPopupHtml(spot) {
    const badgeCls =
      spot.rank === "S" ? "badge-s" : spot.rank === "A" ? "badge-a" : "badge-b";
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
    const nightLine =
      spot.nightViewing && spot.nightViewing !== "—"
        ? `<span>🌙 夜間・備考：${spot.nightViewing}</span>`
        : "";

    return `
      <div class="popup-card">
        <div class="popup-header">
          <span class="badge-rank ${badgeCls}">${spot.rank}</span>
          <span class="popup-title">${spot.name}</span>
        </div>
        <div class="popup-meta">
          <span>🏷️ ${RANK_LABELS[spot.rank]}</span>
          <span>📍 ${spot.area}（${spot.location}）</span>
          <span>🧭 中心圏内 <strong>約${spot.distanceKm.toFixed(1)}km</strong>（${spot.direction}方面）</span>
          <span>🍂 例年の見頃：${spot.bestTime}</span>
          ${nightLine}
        </div>
        <div class="popup-desc">${spot.highlight}</div>
        <div class="popup-actions">
          <a class="popup-link" href="${gmapsUrl}" target="_blank" rel="noopener noreferrer">Googleマップで開く ↗</a>
        </div>
      </div>
    `;
  }

  // ==========================================
  // フィルタ＆レンダリング
  // ==========================================
  function getFilteredSpots() {
    const q = state.search.trim().toLowerCase();

    const filtered = enrichedSpots.filter((s) => {
      if (state.maxDistanceKm !== "ALL" && s.distanceKm > state.maxDistanceKm) return false;
      if (!state.ranks.has(s.rank)) return false;
      if (state.area !== "ALL" && s.area !== state.area) return false;
      if (state.nightOnly && !s.isNight) return false;
      if (q) {
        const hay = `${s.name} ${s.area} ${s.location} ${s.highlight}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (state.sort === "distance") {
        return a.distanceKm - b.distanceKm;
      }
      const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
      if (rankDiff !== 0) return rankDiff;
      return a.distanceKm - b.distanceKm;
    });

    return filtered;
  }

  function setMobileTab(tab) {
    appShell.setAttribute("data-mobile-tab", tab);
    mobileTabBar.querySelectorAll(".mobile-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    if (tab === "map") {
      setTimeout(() => map.invalidateSize(), 60);
    }
  }

  function selectSpot(spot, panTo = true) {
    state.selectedId = spot.id;

    // リスト側の選択状態を更新
    document.querySelectorAll(".spot-card").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.id) === spot.id);
    });

    const card = spotListEl.querySelector(`.spot-card[data-id="${spot.id}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // スマホ表示時にリストからタップしたら地図タブに自動で切り替える
    if (panTo && window.innerWidth <= 820) {
      setMobileTab("map");
    }

    const marker = markerById.get(spot.id);
    if (marker) {
      if (panTo) {
        const targetZoom = Math.max(map.getZoom(), 14);
        setTimeout(() => {
          map.flyTo([spot.lat, spot.lng], targetZoom, { duration: 0.55 });
          marker.openPopup();
        }, window.innerWidth <= 820 ? 100 : 0);
      } else {
        marker.openPopup();
      }
    }
  }

  function render() {
    const list = getFilteredSpots();
    visibleCountEl.textContent = list.length;
    mobileTabCountEl.textContent = list.length;

    // マーカー更新
    markersLayer.clearLayers();
    markerById.clear();

    list.forEach((spot) => {
      const zOffset = spot.rank === "S" ? 1000 : spot.rank === "A" ? 500 : 100;
      const marker = L.marker([spot.lat, spot.lng], {
        icon: createSpotIcon(spot.rank),
        zIndexOffset: zOffset
      });

      marker.bindPopup(buildPopupHtml(spot), { maxWidth: 320 });
      marker.on("click", () => {
        selectSpot(spot, false);
      });

      marker.addTo(markersLayer);
      markerById.set(spot.id, marker);
    });

    // リスト更新
    spotListEl.innerHTML = "";
    if (list.length === 0) {
      spotListEl.innerHTML =
        `<div class="empty-state">条件に一致する紅葉スポットがありません。<br>検索条件やフィルタを緩めてみてください。</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach((spot) => {
      const card = document.createElement("div");
      card.className = "spot-card" + (state.selectedId === spot.id ? " selected" : "");
      card.dataset.id = spot.id;
      card.setAttribute("role", "listitem");

      const badgeCls =
        spot.rank === "S" ? "badge-s" : spot.rank === "A" ? "badge-a" : "badge-b";

      const nightBadge = spot.isNight
        ? `<span class="meta-night">🌙 夜間あり</span>`
        : "";

      card.innerHTML = `
        <div class="spot-card-top">
          <div class="spot-title-group">
            <span class="badge-rank ${badgeCls}">${spot.rank}</span>
            <span class="spot-name">${spot.name}</span>
          </div>
          <span class="spot-distance">${spot.direction} ${spot.distanceKm.toFixed(1)}km</span>
        </div>
        <div class="spot-meta">
          <span class="meta-pill">${spot.area}（${spot.location}）</span>
          <span class="meta-pill">🍂 ${spot.bestTime}</span>
          ${nightBadge}
        </div>
        <div class="spot-highlight">${spot.highlight}</div>
      `;

      card.addEventListener("click", () => selectSpot(spot, true));
      frag.appendChild(card);
    });

    spotListEl.appendChild(frag);
  }

  // ==========================================
  // イベントリスナー
  // ==========================================
  rankFiltersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".rank-chip");
    if (!btn) return;
    const rank = btn.dataset.rank;

    if (state.ranks.has(rank)) {
      state.ranks.delete(rank);
      btn.classList.remove("active");
    } else {
      state.ranks.add(rank);
      btn.classList.add("active");
    }
    render();
  });

  areaSelect.addEventListener("change", (e) => {
    state.area = e.target.value;
    render();
  });

  distanceSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    state.maxDistanceKm = val === "ALL" ? "ALL" : Number(val);
    updateSummaryCounts();
    renderDistanceCircles();
    render();
  });

  sortSelect.addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  searchInput.addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  nightOnlyCheck.addEventListener("change", (e) => {
    state.nightOnly = e.target.checked;
    render();
  });

  railwaysCheck.addEventListener("change", () => {
    renderRailways();
  });

  stationCompanyBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".company-chip");
    if (!btn) return;
    const company = btn.dataset.company;
    if (state.stationCompanies.has(company)) {
      state.stationCompanies.delete(company);
      btn.classList.remove("active");
    } else {
      state.stationCompanies.add(company);
      btn.classList.add("active");
    }
    renderRailways();
  });

  circlesCheck.addEventListener("change", () => {
    renderDistanceCircles();
  });

  resetFiltersBtn.addEventListener("click", () => {
    state.ranks = new Set(["S", "A", "B"]);
    state.area = "ALL";
    state.maxDistanceKm = 20;
    state.sort = "rank";
    state.search = "";
    state.nightOnly = false;

    document.querySelectorAll(".rank-chip").forEach((el) => el.classList.add("active"));
    areaSelect.value = "ALL";
    distanceSelect.value = "20";
    sortSelect.value = "rank";
    searchInput.value = "";
    nightOnlyCheck.checked = false;
    updateSummaryCounts();
    renderDistanceCircles();
    render();
  });

  focusOriginBtn.addEventListener("click", () => {
    map.flyTo([origin.lat, origin.lng], 13, { duration: 0.7 });
  });

  fitKyotoBtn.addEventListener("click", () => {
    const coords = [[origin.lat, origin.lng]];
    markerById.forEach((m) => {
      const ll = m.getLatLng();
      coords.push([ll.lat, ll.lng]);
    });
    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [36, 36] });
    }
  });

  let myLocationMarker = null;

  locateMeBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("お使いのブラウザは現在地取得に対応していません。");
      return;
    }
    locateMeBtn.textContent = "📍 取得中...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (myLocationMarker) {
          map.removeLayer(myLocationMarker);
        }
        myLocationMarker = L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#007aff",
          fillOpacity: 1
        })
          .bindPopup("📍 あなたの現在地")
          .addTo(map)
          .openPopup();
        map.flyTo([latitude, longitude], 14, { duration: 0.7 });
        locateMeBtn.textContent = "📍 現在地";
      },
      () => {
        alert("現在地を取得できませんでした。位置情報の許可設定をご確認ください。");
        locateMeBtn.textContent = "📍 現在地";
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  mobileTabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".mobile-tab-btn");
    if (!btn) return;
    setMobileTab(btn.dataset.tab);
  });

  toggleFiltersBtn.addEventListener("click", () => {
    const collapsed = controlsPanel.classList.toggle("collapsed-filters");
    toggleFiltersBtn.textContent = collapsed ? "絞り込みを表示" : "絞り込みを隠す";
  });

  legendToggleBtn.addEventListener("click", () => {
    const collapsed = mapLegend.classList.toggle("collapsed");
    legendToggleBtn.textContent = collapsed ? "凡例 ▴" : "凡例 ▾";
  });

  // スマホ初期状態設定
  setMobileTab("map");
  if (window.innerWidth <= 820) {
    mapLegend.classList.add("collapsed");
    legendToggleBtn.textContent = "凡例 ▴";
  }

  // 初回描画
  render();
})();

