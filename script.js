"use strict";


/* =========================================================
   設定
========================================================= */

const VALUE_MIN_ZOOM = 7;
const LABEL_MIN_ZOOM = 7.5;
const DATE_MIN_ZOOM = 8;

const OPENFREEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/bright";

const DATA_UPDATED_AT =
  "2026年9月1日";

const RECORD_TYPES = {
  tmax_high: {
    fileName: "highest_records.geojson",
    label: "最高気温記録",
    datePrecision: "day",
    dateLabel: "起日",
    annualOnly: false,
  },

  tmin_high: {
    fileName: "highest_lows.geojson",
    label: "日最低気温の最高記録",
    datePrecision: "day",
    dateLabel: "起日",
    annualOnly: false,
  },

  tmax_low: {
    fileName: "lowest_highs.geojson",
    label: "日最高気温の最低記録",
    datePrecision: "day",
    dateLabel: "起日",
    annualOnly: false,
  },

  tmin_low: {
    fileName: "lowest_records.geojson",
    label: "最低気温記録",
    datePrecision: "day",
    dateLabel: "起日",
    annualOnly: false,
  },

  tmean_month_high: {
    fileName: "highest_monthly_means.geojson",
    label: "月平均気温の最高記録",
    datePrecision: "month",
    dateLabel: "起月",
    annualOnly: false,
  },

  tmean_month_low: {
    fileName: "lowest_monthly_means.geojson",
    label: "月平均気温の最低記録",
    datePrecision: "month",
    dateLabel: "起月",
    annualOnly: false,
  },

  tmean_year_high: {
    fileName: "highest_annual_means.geojson",
    label: "年平均気温の最高記録",
    datePrecision: "year",
    dateLabel: "起年",
    annualOnly: true,
  },

  tmean_year_low: {
    fileName: "lowest_annual_means.geojson",
    label: "年平均気温の最低記録",
    datePrecision: "year",
    dateLabel: "起年",
    annualOnly: true,
  },
};

const STATION_SOURCE_ID =
  "stations-source";

const STATION_SQUARE_OUTER_LAYER =
  "stations-square-outer";

const STATION_SQUARE_BORDER_LAYER =
  "stations-square-border";

const STATION_SQUARE_LAYER =
  "stations-square";

const STATION_VALUE_ONLY_LAYER =
  "stations-value-only";

const STATION_VALUE_NAME_VALUE_LAYER =
  "stations-value-name-value";

const STATION_VALUE_NAME_LABEL_LAYER =
  "stations-value-name-label";

const STATION_FULL_VALUE_LAYER =
  "stations-full-value";

const STATION_FULL_LABEL_LAYER =
  "stations-full-label";

const STATION_FULL_DATE_LAYER =
  "stations-full-date";

const STATION_VALUE_ONLY_BOLD_LAYER =
  "stations-value-only-bold";

const STATION_VALUE_NAME_VALUE_BOLD_LAYER =
  "stations-value-name-value-bold";

const STATION_VALUE_NAME_LABEL_BOLD_LAYER =
  "stations-value-name-label-bold";

const STATION_FULL_VALUE_BOLD_LAYER =
  "stations-full-value-bold";

const STATION_FULL_LABEL_BOLD_LAYER =
  "stations-full-label-bold";

const STATION_FULL_DATE_BOLD_LAYER =
  "stations-full-date-bold";

const STATION_INTERACTIVE_LAYERS = [
  STATION_SQUARE_LAYER,

  STATION_VALUE_ONLY_LAYER,

  STATION_VALUE_NAME_VALUE_LAYER,
  STATION_VALUE_NAME_LABEL_LAYER,

  STATION_FULL_VALUE_LAYER,
  STATION_FULL_LABEL_LAYER,
  STATION_FULL_DATE_LAYER,
];

let currentRecordType =
  "tmax_high";

let currentPeriod =
  "annual";

let stationInteractionsInitialized =
  false;


/* =========================================================
   HTML要素
========================================================= */

const dataUpdateDate =
  document.getElementById(
    "data-update-date"
  );

const statusMessage =
  document.getElementById(
    "status-message"
  );

const legendRows =
  document.getElementById(
    "legend-rows"
  );

const elementSelect =
  document.getElementById(
    "element-select"
  );

const periodSelect =
  document.getElementById(
    "period-select"
  );

dataUpdateDate.textContent =
  `データ更新日：${DATA_UPDATED_AT}`;


/* =========================================================
   地図
========================================================= */

const map =
  new maplibregl.Map({
    container: "map",

    style:
      OPENFREEMAP_STYLE,

    center: [
      137.0,
      38.0,
    ],

    zoom: 4,

    minZoom: 4,
    maxZoom: 10,

    /*
     * 日本周辺から外へ移動できなくする。
     *
     * 左下：[西端経度, 南端緯度]
     * 右上：[東端経度, 北端緯度]
     *
     * 南鳥島・沖ノ鳥島まで考慮して広めに取る。
     */
    maxBounds: [
      [118.0, 20.0],
      [158.0, 47.0],
    ],

    attributionControl:
      false,
  });

map.dragRotate.disable();

map.touchZoomRotate
  .disableRotation();

map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
  }),
  "bottom-right"
);

map.addControl(
  new maplibregl.NavigationControl({
    showCompass: false,
  }),
  "top-left"
);


/* =========================================================
   共通関数
========================================================= */

function getRecordDataFile() {
  const config =
    RECORD_TYPES[
      currentRecordType
    ];

  return (
    "record_data/" +
    `${currentPeriod}/` +
    `${config.fileName}`
  );
}


function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function formatDate(dateText) {
  if (!dateText) {
    return "なし";
  }

  const text =
    String(dateText);

  let match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (match) {
    return (
      `${match[1]}年` +
      `${Number(match[2])}月` +
      `${Number(match[3])}日`
    );
  }

  match =
    text.match(
      /^(\d{4})-(\d{2})$/
    );

  if (match) {
    return (
      `${match[1]}年` +
      `${Number(match[2])}月`
    );
  }

  match =
    text.match(
      /^(\d{4})$/
    );

  if (match) {
    return (
      `${match[1]}年`
    );
  }

  return escapeHtml(
    text
  );
}


function formatRecordDateSlash(
  dateText
) {
  if (!dateText) {
    return "";
  }

  const text =
    String(dateText);

  let match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (match) {
    return (
      `${match[1]}/` +
      `${match[2]}/` +
      `${match[3]}`
    );
  }

  match =
    text.match(
      /^(\d{4})-(\d{2})$/
    );

  if (match) {
    return (
      `${match[1]}/` +
      `${match[2]}`
    );
  }

  match =
    text.match(
      /^(\d{4})$/
    );

  if (match) {
    return match[1];
  }

  return text;
}


/* =========================================================
   気温色・縁取り
========================================================= */

function getTemperatureColor(
  temp
) {
  if (
    temp === null ||
    temp === undefined ||
    Number.isNaN(
      Number(temp)
    )
  ) {
    return "#8f969e";
  }

  const value =
    Number(temp);

  if (value >= 40) {
    return "#50002e";
  }

  if (value >= 35) {
    return "#b40068";
  }

  if (value >= 30) {
    return "#ff2800";
  }

  if (value >= 25) {
    return "#ff9900";
  }

  if (value >= 20) {
    return "#faf500";
  }

  if (value >= 15) {
    return "#ffff96";
  }

  if (value >= 10) {
    return "#fffff0";
  }

  if (value >= 5) {
    return "#b9ebff";
  }

  if (value >= 0) {
    return "#0096ff";
  }

  if (value >= -5) {
    return "#0041ff";
  }

  if (value >= -10) {
    return "#002080";
  }

  if (value >= -15) {
    return "#4d4471";
  }

  if (value >= -20) {
    return "#776fa4";
  }

  if (value >= -25) {
    return "#a8a3c5";
  }

  return "#d8d6e4";
}


function getTemperatureHaloColor(
  temp
) {
  if (
    temp === null ||
    temp === undefined ||
    Number.isNaN(
      Number(temp)
    )
  ) {
    return "#000000";
  }

  const value =
    Number(temp);

  if (
    value >= 35 ||
    (
      value < 5 &&
      value >= -20
    )
  ) {
    return "#ffffff";
  }

  return "#000000";
}


/* =========================================================
   GeoJSONを表示用に整形
========================================================= */

function prepareStationGeoJson(
  geojson
) {
  const features =
    Array.isArray(
      geojson?.features
    )
      ? geojson.features
      : [];

  features.forEach(
    (feature) => {
      const properties =
        feature.properties ??
        {};

      const value =
        properties.record_value;

      const numericValue =
        value === null ||
        value === undefined
          ? NaN
          : Number(value);

      properties._record_color =
        getTemperatureColor(
          value
        );

      properties._record_halo =
        getTemperatureHaloColor(
          value
        );

      properties._record_display =
        Number.isNaN(
          numericValue
        )
          ? "記録なし"
          : numericValue.toFixed(
              1
            );

      properties._record_date_slash =
        formatRecordDateSlash(
          properties.record_date
        );

      feature.properties =
        properties;
    }
  );

  return geojson;
}


/* =========================================================
   背景スタイルを単純化
========================================================= */

function simplifyBaseMapStyle() {
  const style =
    map.getStyle();

  if (
    !style ||
    !Array.isArray(
      style.layers
    )
  ) {
    throw new Error(
      "OpenFreeMapのスタイル情報を取得できませんでした。"
    );
  }

  /*
   * OpenMapTilesのwaterレイヤーと
   * boundaryレイヤーを探す。
   */
  const originalWaterLayer =
    style.layers.find(
      (layer) => {
        return (
          layer[
            "source-layer"
          ] === "water"
        );
      }
    );

  const originalBoundaryLayer =
    style.layers.find(
      (layer) => {
        return (
          layer[
            "source-layer"
          ] === "boundary"
        );
      }
    );

  if (!originalWaterLayer) {
    throw new Error(
      "waterレイヤーが見つかりませんでした。"
    );
  }

  if (!originalBoundaryLayer) {
    throw new Error(
      "boundaryレイヤーが見つかりませんでした。"
    );
  }

  const waterSource =
    originalWaterLayer.source;

  const boundarySource =
    originalBoundaryLayer.source;

  /*
   * 既存の描画レイヤーをすべて削除。
   * source自体は残す。
   */
  [...style.layers]
    .reverse()
    .forEach(
      (layer) => {
        if (
          map.getLayer(
            layer.id
          )
        ) {
          map.removeLayer(
            layer.id
          );
        }
      }
    );


  /*
   * 陸地。
   * 世界全体を緑で塗る。
   */
  map.addLayer({
    id:
      "simple-land",

    type:
      "background",

    paint: {
      "background-color":
        "#dcefd2",
    },
  });


  /*
   * 海・湖沼。
   */
  map.addLayer({
    id:
      "simple-water",

    type:
      "fill",

    source:
      waterSource,

    "source-layer":
      "water",

    filter: [
      "in",
      [
        "get",
        "class",
      ],
      [
        "literal",
        [
          "ocean",
          "lake",
        ],
      ],
    ],

    paint: {
      "fill-color":
        "#cfe8f3",

      "fill-opacity":
        1,
    },
  });


  /*
   * 水域の輪郭。
   * 湖岸線だけ描く。
   */
  map.addLayer({
    id:
      "simple-water-outline",

    type:
      "line",

    source:
      waterSource,

    "source-layer":
      "water",

    filter: [
      "==",
      [
        "get",
        "class",
      ],
      "lake",
    ],

    paint: {
      "line-color":
        "#7699a5",

      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        0.45,

        10,
        0.9,

        14,
        1.2,
      ],

      "line-opacity":
        0.9,
    },
  });


  /*
   * 北海道の振興局ポリゴン
   */
  map.addSource(
    "hokkaido-subprefectures-source",
    {
      type:
        "geojson",

      data:
        `hokkaido_subprefectures.geojson?v=${Date.now()}`,
    }
  );

  /*
   * 振興局境界
   */
  map.addLayer({
    id:
      "hokkaido-subprefectures",

    type:
      "line",

    source:
      "hokkaido-subprefectures-source",

    layout: {
      "line-cap":
        "round",

      "line-join":
        "round",
    },

    paint: {
      "line-color":
        "#687278",

      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        0.8,

        8,
        1.2,

        14,
        1.8,
      ],

      "line-opacity":
        0.95,
    },
  });


  /*
   * 日本周辺の海岸線
   */
  map.addSource(
    "japan-coastline-source",
    {
      type:
        "geojson",

      data:
        `japan_coastline.geojson?v=${Date.now()}`,
    }
  );

  map.addLayer({
    id:
      "japan-coastline",

    type:
      "line",

    source:
      "japan-coastline-source",

    layout: {
      "line-cap":
        "round",

      "line-join":
        "round",
    },

    paint: {
      "line-color":
        "#222222",

      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        0.55,

        8,
        0.75,

        12,
        1.0,

        14,
        1.2,
      ],

      "line-opacity":
        0.9,
    },
  });


  /*
   * 都道府県境。
   * 日本ではadmin_level=4。
   */
  map.addLayer({
    id:
      "prefecture-boundaries",

    type:
      "line",

    source:
      boundarySource,

    "source-layer":
      "boundary",

    filter: [
      "all",

      [
        "==",
        [
          "get",
          "admin_level",
        ],
        4,
      ],

      [
        "!=",
        [
          "get",
          "maritime",
        ],
        1,
      ],
    ],

    paint: {
      "line-color":
        "#687278",

      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        0.8,

        8,
        1.2,

        14,
        1.8,
      ],

      "line-opacity":
        0.95,
    },
  });
}


/* =========================================================
   アメダス地点レイヤー
========================================================= */

function addBoldOverlayLayer(
  baseLayerId,
  boldLayerId,
  haloWidth
) {
  const style =
    map.getStyle();

  const baseLayer =
    style.layers.find(
      (layer) => {
        return (
          layer.id ===
          baseLayerId
        );
      }
    );

  if (!baseLayer) {
    throw new Error(
      `${baseLayerId} が見つかりません。`
    );
  }

  const boldLayer =
    JSON.parse(
      JSON.stringify(
        baseLayer
      )
    );

  boldLayer.id =
    boldLayerId;

  boldLayer.paint = {
    ...boldLayer.paint,

    /*
     * 文字本体と同じ色のhaloを
     * 重ねて、擬似的に太字化する。
     */
    "text-halo-color":
      boldLayer.paint[
        "text-color"
      ],

    "text-halo-width":
      haloWidth,

    "text-halo-blur":
      0,
  };

  map.addLayer(
    boldLayer
  );
}

function addStationLayers(
  geojson
) {
  const existingSource =
    map.getSource(
      STATION_SOURCE_ID
    );

  if (existingSource) {
    existingSource.setData(
      geojson
    );

    return;
  }

  map.addSource(
    STATION_SOURCE_ID,
    {
      type:
        "geojson",

      data:
        geojson,
    }
  );


  /*
   * ズーム7未満：
   * 正方形の外側の白縁。
   *
   * Unicodeの■を3枚重ねることで、
   * DOM Markerを使わず正方形を維持する。
   */
  map.addLayer({
    id:
      STATION_SQUARE_OUTER_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    maxzoom:
      VALUE_MIN_ZOOM,

    layout: {
      "text-field":
        "■",

      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        13,

        7,
        16,
      ],

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color":
        "#ffffff",
    },
  });


  /*
   * 正方形の黒い縁。
   */
  map.addLayer({
    id:
      STATION_SQUARE_BORDER_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    maxzoom:
      VALUE_MIN_ZOOM,

    layout: {
      "text-field":
        "■",

      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        11,

        7,
        14,
      ],

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color":
        "#222222",
    },
  });


  /*
   * 正方形本体。
   */
  map.addLayer({
    id:
      STATION_SQUARE_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    maxzoom:
      VALUE_MIN_ZOOM,

    layout: {
      "text-field":
        "■",

      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],

        4,
        9,

        7,
        12,
      ],

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color": [
        "get",
        "_record_color",
      ],
    },
  });


  /*
   * =========================================================
   * ① ズーム7～7.5
   * 数値のみ
   * =========================================================
   */

  map.addLayer({
    id:
      STATION_VALUE_ONLY_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      VALUE_MIN_ZOOM,

    maxzoom:
      LABEL_MIN_ZOOM,

    layout: {
      "text-field": [
        "get",
        "_record_display",
      ],

      "text-size":
        15,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color": [
        "get",
        "_record_color",
      ],

      "text-halo-color": [
        "get",
        "_record_halo",
      ],

      "text-halo-width":
        2.5,
    },
  });

  addBoldOverlayLayer(
    STATION_VALUE_ONLY_LAYER,
    STATION_VALUE_ONLY_BOLD_LAYER,
    0.7
  );


  /*
   * =========================================================
   * ② ズーム7.5～8
   * 数値＋地点名
   *
   * 2行全体の中心をアメダス位置に合わせる。
   * =========================================================
   */

  /*
   * 上段：数値
   */
  map.addLayer({
    id:
      STATION_VALUE_NAME_VALUE_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      LABEL_MIN_ZOOM,

    maxzoom:
      DATE_MIN_ZOOM,

    layout: {
      "text-field": [
        "get",
        "_record_display",
      ],

      "text-size":
        15,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color": [
        "get",
        "_record_color",
      ],

      "text-halo-color": [
        "get",
        "_record_halo",
      ],

      "text-halo-width":
        2.5,

      "text-translate": [
        0,
        -7,
      ],

      "text-translate-anchor":
        "viewport",
    },
  });

  addBoldOverlayLayer(
    STATION_VALUE_NAME_VALUE_LAYER,
    STATION_VALUE_NAME_VALUE_BOLD_LAYER,
    0.7
  );


  /*
   * 下段：地点名
   */
  map.addLayer({
    id:
      STATION_VALUE_NAME_LABEL_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      LABEL_MIN_ZOOM,

    maxzoom:
      DATE_MIN_ZOOM,

    layout: {
      "text-field": [
        "get",
        "name",
      ],

      "text-size":
        12,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color":
        "#111111",

      "text-halo-color":
        "#ffffff",

      "text-halo-width":
        1.5,

      "text-translate": [
        0,
        8.5,
      ],

      "text-translate-anchor":
        "viewport",
    },
  });

  addBoldOverlayLayer(
    STATION_VALUE_NAME_LABEL_LAYER,
    STATION_VALUE_NAME_LABEL_BOLD_LAYER,
    0.2
  );


  /*
   * =========================================================
   * ③ ズーム8以上
   * 数値＋地点名＋起日
   *
   * 3行全体の中心をアメダス位置に合わせる。
   * =========================================================
   */

  /*
   * 上段：数値
   */
  map.addLayer({
    id:
      STATION_FULL_VALUE_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      DATE_MIN_ZOOM,

    layout: {
      "text-field": [
        "get",
        "_record_display",
      ],

      "text-size":
        15,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color": [
        "get",
        "_record_color",
      ],

      "text-halo-color": [
        "get",
        "_record_halo",
      ],

      "text-halo-width":
        2.5,

      "text-translate": [
        0,
        -14,
      ],

      "text-translate-anchor":
        "viewport",
    },
  });

  addBoldOverlayLayer(
    STATION_FULL_VALUE_LAYER,
    STATION_FULL_VALUE_BOLD_LAYER,
    0.7
  );


  /*
   * 中段：地点名
   */
  map.addLayer({
    id:
      STATION_FULL_LABEL_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      DATE_MIN_ZOOM,

    layout: {
      "text-field": [
        "get",
        "name",
      ],

      "text-size":
        12,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color":
        "#111111",

      "text-halo-color":
        "#ffffff",

      "text-halo-width":
        1.5,

      "text-translate": [
        0,
        1.5,
      ],

      "text-translate-anchor":
        "viewport",
    },
  });

  addBoldOverlayLayer(
    STATION_FULL_LABEL_LAYER,
    STATION_FULL_LABEL_BOLD_LAYER,
    0.2
  );


  /*
   * 下段：起日
   */
  map.addLayer({
    id:
      STATION_FULL_DATE_LAYER,

    type:
      "symbol",

    source:
      STATION_SOURCE_ID,

    minzoom:
      DATE_MIN_ZOOM,

    filter: [
      "!=",
      [
        "get",
        "_record_date_slash",
      ],
      "",
    ],

    layout: {
      "text-field": [
        "get",
        "_record_date_slash",
      ],

      "text-size":
        12,

      "text-anchor":
        "center",

      "text-allow-overlap":
        true,

      "text-ignore-placement":
        true,

      "text-padding":
        0,
    },

    paint: {
      "text-color":
        "#333333",

      "text-halo-color":
        "#ffffff",

      "text-halo-width":
        2,

      "text-translate": [
        0,
        15.5,
      ],

      "text-translate-anchor":
        "viewport",
    },
  });

  addBoldOverlayLayer(
    STATION_FULL_DATE_LAYER,
    STATION_FULL_DATE_BOLD_LAYER,
    0.25
  );

  initializeStationInteractions();
}


/* =========================================================
   ポップアップ
========================================================= */

function createPopupHtml(
  properties
) {
  const name =
    escapeHtml(
      properties.name ??
      "名称不明"
    );

  const nameKana =
    escapeHtml(
      properties.name_kana ??
      ""
    );

  /*
   * 読み仮名が存在する場合だけ括弧書きする。
   */
  const displayName =
    nameKana
      ? `${name}（${nameKana}）`
      : name;

  const value =
    properties.record_value;

  const altitude =
    properties.altitude_m;

  const date =
    properties.record_date;

  const url =
    properties.record_rank_url;

  const dateLabel =
    RECORD_TYPES[
      currentRecordType
    ]?.dateLabel ??
    "記録時期";

  const recordText =
    value === null ||
    value === undefined
      ? "記録：なし"
      : (
          "記録：" +
          `<strong>${Number(value).toFixed(1)} ℃</strong>`
        );

  const altitudeText =
    altitude === null ||
    altitude === undefined
      ? "標高：不明"
      : (
          "標高：" +
          `${Number(altitude).toLocaleString("ja-JP")} m`
        );

  const linkHtml =
    url
      ? `
        <a
          class="popup-link"
          href="${escapeHtml(url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          気象庁のランキングページを開く
        </a>
      `
      : "";

  return `
    <div class="popup-title">
      ${displayName}
    </div>

    <div class="popup-record">
      ${recordText}
    </div>

    <div class="popup-sub">
      ${dateLabel}：${formatDate(date)}
      <br>

      ${altitudeText}
      <br>

      アメダスコード：
      ${escapeHtml(
        properties.amedas_code ??
        "不明"
      )}
    </div>

    ${linkHtml}
  `;
}


function openStationPopup(
  event
) {
  const visibleLayers =
    STATION_INTERACTIVE_LAYERS
      .filter(
        (layerId) => {
          return Boolean(
            map.getLayer(
              layerId
            )
          );
        }
      );

  const features =
    map.queryRenderedFeatures(
      event.point,
      {
        layers:
          visibleLayers,
      }
    );

  if (
    !features ||
    features.length === 0
  ) {
    return;
  }

  const feature =
    features[0];

  const coordinates =
    feature.geometry
      ?.coordinates;

  if (
    !Array.isArray(
      coordinates
    ) ||
    coordinates.length < 2
  ) {
    return;
  }

  new maplibregl.Popup({
    offset: 16,
    maxWidth: "320px",
  })
    .setLngLat([
      Number(
        coordinates[0]
      ),
      Number(
        coordinates[1]
      ),
    ])
    .setHTML(
      createPopupHtml(
        feature.properties ??
        {}
      )
    )
    .addTo(
      map
    );
}


function initializeStationInteractions() {
  if (stationInteractionsInitialized) {
    return;
  }

  STATION_INTERACTIVE_LAYERS.forEach((layerId) => {
    map.on(
      "mouseenter",
      layerId,
      () => {
        map.getCanvas().style.cursor =
          "pointer";
      }
    );

    map.on(
      "mouseleave",
      layerId,
      () => {
        map.getCanvas().style.cursor =
          "";
      }
    );
  });

  map.on(
    "click",
    openStationPopup
  );

  stationInteractionsInitialized =
    true;
}


/* =========================================================
   極値GeoJSON読み込み
========================================================= */

async function loadStations() {
  const dataFile =
    getRecordDataFile();

  const response =
    await fetch(
      `${dataFile}?v=${Date.now()}`,
      {
        cache:
          "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `${dataFile}の取得に失敗しました。` +
      ` HTTP ${response.status}`
    );
  }

  const rawGeoJson =
    await response.json();

  const geojson =
    prepareStationGeoJson(
      rawGeoJson
    );

  addStationLayers(
    geojson
  );

  const successCount =
    geojson.features.filter(
      (feature) => {
        return (
          feature.properties
            ?.record_status ===
          "success"
        );
      }
    ).length;

  statusMessage.textContent =
    `${successCount}地点を表示中`;

  window.setTimeout(
    () => {
      statusMessage.style.display =
        "none";
    },
    3500
  );
}


async function changeRecordType(
  recordType
) {
  const config =
    RECORD_TYPES[
      recordType
    ];

  if (!config) {
    return;
  }

  const previousRecordType =
    currentRecordType;

  const previousPeriod =
    currentPeriod;

  currentRecordType =
    recordType;

  /*
   * 年平均気温の極値は通年ページにしか存在しないため、
   * 自動的に通年へ切り替え、期間選択を無効化する。
   */
  if (config.annualOnly) {
    currentPeriod =
      "annual";

    periodSelect.value =
      "annual";

    periodSelect.disabled =
      true;

  } else {
    periodSelect.disabled =
      false;
  }

  statusMessage.textContent =
    "観測項目を切り替え中…";

  statusMessage.style.display =
    "block";

  try {
    await loadStations();

    buildLegend();

  } catch (error) {
    currentRecordType =
      previousRecordType;

    currentPeriod =
      previousPeriod;

    elementSelect.value =
      previousRecordType;

    periodSelect.value =
      previousPeriod;

    periodSelect.disabled =
      Boolean(
        RECORD_TYPES[
          previousRecordType
        ]?.annualOnly
      );

    throw error;
  }
}

async function changePeriod(
  period
) {
  const config =
    RECORD_TYPES[
      currentRecordType
    ];

  if (
    config?.annualOnly
  ) {
    currentPeriod =
      "annual";

    periodSelect.value =
      "annual";

    return;
  }

  const previousPeriod =
    currentPeriod;

  currentPeriod =
    period;

  statusMessage.textContent =
    "期間を切り替え中…";

  statusMessage.style.display =
    "block";

  try {
    await loadStations();

    buildLegend();

  } catch (error) {
    currentPeriod =
      previousPeriod;

    periodSelect.value =
      previousPeriod;

    throw error;
  }
}

/* =========================================================
   凡例
========================================================= */

function buildLegend() {
  const colors = [
    getTemperatureColor(40),
    getTemperatureColor(35),
    getTemperatureColor(30),
    getTemperatureColor(25),
    getTemperatureColor(20),
    getTemperatureColor(15),
    getTemperatureColor(10),
    getTemperatureColor(5),
    getTemperatureColor(0),
    getTemperatureColor(-5),
    getTemperatureColor(-10),
    getTemperatureColor(-15),
    getTemperatureColor(-20),
    getTemperatureColor(-25),
    getTemperatureColor(-30),
  ];

  const boundaries = [
    40,
    35,
    30,
    25,
    20,
    15,
    10,
    5,
    0,
    -5,
    -10,
    -15,
    -20,
    -25,
  ];

  legendRows.innerHTML = `
    <div class="continuous-legend">

      <div class="legend-colors">
        ${colors.map(
          (color) => `
            <div
              class="legend-color-block"
              style="background-color: ${color};"
            ></div>
          `
        ).join("")}
      </div>

      <div class="legend-boundaries">
        ${boundaries.map(
          (
            value,
            index
          ) => `
            <span
              style="top: ${(index + 1) * 16 + index * 2 + 1}px;"
            >
              ${value}
            </span>
          `
        ).join("")}
      </div>

    </div>
  `;
}


function syncPeriodSelectState() {
  const config =
    RECORD_TYPES[
      currentRecordType
    ];

  periodSelect.disabled =
    Boolean(
      config?.annualOnly
    );

  if (config?.annualOnly) {
    currentPeriod =
      "annual";

    periodSelect.value =
      "annual";
  }
}


/* =========================================================
   イベント
========================================================= */

elementSelect.addEventListener(
  "change",
  async () => {
    try {
      await changeRecordType(
        elementSelect.value
      );

    } catch (error) {
      console.error(
        error
      );

      statusMessage.textContent =
        "観測項目の切り替えに失敗しました。";

      statusMessage.style.display =
        "block";
    }
  }
);


periodSelect.addEventListener(
  "change",
  async () => {
    try {
      await changePeriod(
        periodSelect.value
      );

    } catch (error) {
      console.error(
        error
      );

      statusMessage.textContent =
        "期間の切り替えに失敗しました。";

      statusMessage.style.display =
        "block";
    }
  }
);


function setupCollapsiblePanel(
  buttonId,
  contentId
) {
  const button =
    document.getElementById(
      buttonId
    );

  const content =
    document.getElementById(
      contentId
    );

  button.addEventListener(
    "click",
    () => {
      const collapsed =
        content.classList.toggle(
          "collapsed"
        );

      button.textContent =
        collapsed
          ? "+"
          : "−";

      button.setAttribute(
        "aria-label",
        collapsed
          ? "展開"
          : "最小化"
      );
    }
  );
}


setupCollapsiblePanel(
  "legend-toggle",
  "legend-content"
);

setupCollapsiblePanel(
  "information-toggle",
  "information-content"
);

syncPeriodSelectState();


/* =========================================================
   初期化
========================================================= */

map.on(
  "load",
  async () => {
    try {
      statusMessage.textContent =
        "背景地図を作成中…";

      simplifyBaseMapStyle();

      statusMessage.textContent =
        "極値データを読み込み中…";

      await loadStations();

      buildLegend();

    } catch (error) {
      console.error(
        error
      );

      statusMessage.textContent =
        "地図データの読み込みに失敗しました。" +
        "F12のConsoleを確認してください。";

      statusMessage.style.display =
        "block";
    }
  }
);