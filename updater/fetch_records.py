import argparse
import json
import re
import time
from pathlib import Path
import pandas as pd
import requests
from bs4 import BeautifulSoup


# =========================================================
# 基本設定
# =========================================================

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent

INPUT_CSV = (
    SCRIPT_DIR
    / "amedas_stations_with_etrn_codes.csv"
)

OUTPUT_BASE_DIR = (
    REPO_DIR
    / "record_data"
)

REQUEST_INTERVAL = 0.5

# True:
#   取得失敗地点もGeoJSONに含める
#
# False:
#   取得成功地点だけGeoJSONへ出力
INCLUDE_MISSING = True


# =========================================================
# 観測項目設定
# =========================================================

RECORD_TYPES = {

    "a": {
        "label": "最高気温記録",
        "jma_row": "日最高気温の高い方から",
        "filename": "highest_records.geojson",
        "failed_filename": "highest_records_failed.csv",
        "date_precision": "day",
    },

    "b": {
        "label": "日最低気温の最高記録",
        "jma_row": "日最低気温の高い方から",
        "filename": "highest_lows.geojson",
        "failed_filename": "highest_lows_failed.csv",
        "date_precision": "day",
    },

    "c": {
        "label": "日最高気温の最低記録",
        "jma_row": "日最高気温の低い方から",
        "filename": "lowest_highs.geojson",
        "failed_filename": "lowest_highs_failed.csv",
        "date_precision": "day",
    },

    "d": {
        "label": "最低気温記録",
        "jma_row": "日最低気温の低い方から",
        "filename": "lowest_records.geojson",
        "failed_filename": "lowest_records_failed.csv",
        "date_precision": "day",
    },

    "e": {
        "label": "月平均気温の最高記録",
        "jma_row": "月平均気温の高い方から",
        "filename": "highest_monthly_means.geojson",
        "failed_filename": "highest_monthly_means_failed.csv",
        "date_precision": "month",
    },

    "f": {
        "label": "月平均気温の最低記録",
        "jma_row": "月平均気温の低い方から",
        "filename": "lowest_monthly_means.geojson",
        "failed_filename": "lowest_monthly_means_failed.csv",
        "date_precision": "month",
    },

    "g": {
        "label": "年平均気温の最高記録",
        "jma_row": "年平均気温の高い方から",
        "filename": "highest_annual_means.geojson",
        "failed_filename": "highest_annual_means_failed.csv",
        "date_precision": "year",
    },

    "h": {
        "label": "年平均気温の最低記録",
        "jma_row": "年平均気温の低い方から",
        "filename": "lowest_annual_means.geojson",
        "failed_filename": "lowest_annual_means_failed.csv",
        "date_precision": "year",
    },
}

def parse_arguments():
    parser = argparse.ArgumentParser(
        description="アメダス極値データを取得します。"
    )

    parser.add_argument(
        "--record",
        choices=RECORD_TYPES.keys(),
        help="観測項目 a～h",
    )

    parser.add_argument(
        "--month",
        type=int,
        choices=range(0, 13),
        help="対象月。0=通年、1～12=各月",
    )

    args = parser.parse_args()

    # --record と --month はセットで指定する。
    if (args.record is None) != (args.month is None):
        parser.error(
            "--record と --month は両方指定するか、"
            "両方省略してください。"
        )

    # 年平均気温は通年のみ。
    if (
        args.record in {"g", "h"}
        and args.month is not None
        and args.month != 0
    ):
        parser.error(
            "g/h（年平均気温）は --month 0 のみ指定できます。"
        )

    return args

# =========================================================
# 入力
# =========================================================

def select_record_type() -> tuple[str, dict]:

    print()
    print("観測項目を選択してください")
    print()
    print("a = 最高気温記録")
    print("b = 日最低気温の最高記録")
    print("c = 日最高気温の最低記録")
    print("d = 最低気温記録")
    print("e = 月平均気温の最高記録")
    print("f = 月平均気温の最低記録")
    print("g = 年平均気温の最高記録")
    print("h = 年平均気温の最低記録")
    print()

    while True:

        choice = (
            input("選択 [a-h]: ")
            .strip()
            .lower()
        )

        if choice in RECORD_TYPES:
            config = RECORD_TYPES[choice]

            print()
            print("観測項目: " f"{config['label']}")

            return choice, config

        print("a～hのいずれかを" "入力してください。")


def select_month(record_config: dict) -> int:

    if record_config["date_precision"] == "year":
        print()
        print("年平均気温は通年データを取得します。")
        print("対象期間: 通年")

        return 0

    print()
    print("対象月を選択してください")
    print()
    print(" 0 = 通年")

    for month in range(1, 13):
        print(f"{month:2d} = "f"{month}月")

    print()

    while True:

        value = input("選択 [0-12]: ").strip()

        try:
            month = int(value)

        except ValueError:
            print("0～12の整数を" "入力してください。")
            continue

        if 0 <= month <= 12:

            print()

            if month == 0:
                print("対象期間: 通年")

            else:
                print(f"対象期間: {month}月")

            return month

        print("0～12の整数を""入力してください。")


# =========================================================
# 共通関数
# =========================================================

def clean_text(value: str,) -> str:

    if value is None:
        return ""
    
    return re.sub(r"\s+", "", str(value),)


def nullable_text(value,) -> str | None:

    if pd.isna(value):
        return None
    
    text = str(value).strip()

    return (text if text else None)


def nullable_float(value,) -> float | None:

    if pd.isna(value):
        return None
    return float(value)


def nullable_int_string(value, width: int | None = None,) -> str | None:

    if pd.isna(value):
        return None
    
    number = str(value).strip()

    if number.endswith(".0"):
        number = number[:-2]

    if width is not None:
        number = number.zfill(width)

    return number


# =========================================================
# 出力ディレクトリ
# =========================================================

def get_period_directory(month: int,) -> Path:

    if month == 0:
        return (OUTPUT_BASE_DIR / "annual")

    return (OUTPUT_BASE_DIR / f"{month:02d}")


# =========================================================
# 気象庁ランキングURL生成
# =========================================================

def make_rank_url(prec_no: str, block_no: str, station_class: str, month: int,) -> str:

    """
    station_class

    s:
        気象官署等

    a:
        一般アメダス

    month

    0:
        通年

    1～12:
        各月
    """

    page = ("rank_s.php" if station_class == "s" else "rank_a.php")

    if month == 0:
        month_param = ""

    else:
        month_param = (f"{month:02d}")

    return (
        "https://www.data.jma.go.jp/"
        "stats/etrn/view/"
        f"{page}"
        f"?prec_no={prec_no}"
        f"&block_no={block_no}"
        "&year="
        f"&month={month_param}"
        "&day="
        "&view=p1"
    )


# =========================================================
# 記録取得
# =========================================================

def extract_record_date(text: str, date_precision: str,) -> str:

    if date_precision == "day":
        match = re.search(r"\((\d{4})/" r"(\d{1,2})/" r"(\d{1,2})\)",text,)

        if not match:
            return ""

        year, month, day = map(int,match.groups(),)

        return (f"{year:04d}-" f"{month:02d}-" f"{day:02d}")

    if date_precision == "month":
        match = re.search(r"\((\d{4})/" r"(\d{1,2})\)", text,)

        if not match:
            return ""

        year, month = map(int,match.groups(),)

        return (f"{year:04d}-" f"{month:02d}")

    if date_precision == "year":
        match = re.search(r"\((\d{4})\)",text,)

        if not match:
            return ""

        return match.group(1)

    raise ValueError("date_precisionが不正です: " f"{date_precision}")

def extract_stat_start(
    text: str,
    date_precision: str,
) -> str:

    if date_precision == "year":
        match = re.search(
            r"(\d{4})年?",
            text,
        )

        if not match:
            return ""

        return match.group(1)

    match = re.search(
        r"(\d{4})/(\d{1,2})",
        text,
    )

    if not match:
        return ""

    year, month = map(
        int,
        match.groups(),
    )

    return (
        f"{year:04d}-"
        f"{month:02d}"
    )

def extract_record(session: requests.Session, url: str, target_row: str, date_precision: str,) -> dict:

    response = session.get(url, timeout=30,)
    response.raise_for_status()
    response.encoding = (response.apparent_encoding)
    soup = BeautifulSoup(response.text, "html.parser",)

    for tr in soup.find_all("tr"):

        cells = tr.find_all(["th", "td",])

        if not cells:
            continue

        texts = [cell.get_text(" ", strip=True,) for cell in cells]

        if not texts:
            continue

        first_cell = clean_text(texts[0])
        target_clean = clean_text(target_row)

        if (target_clean not in first_cell):
            continue

        # ---------------------------------------------
        # 1位セル
        # ---------------------------------------------

        if len(cells) < 2:
            return {
                "record_value": None,
                "record_date": "",
                "stat_start": "",
                "status": "first_rank_cell_missing",
            }

        first_rank_text = (cells[1].get_text(" ", strip=True,))

        # ---------------------------------------------
        # 統計期間セル
        # ---------------------------------------------

        stat_period_text = (cells[-1].get_text(" ", strip=True,))

        stat_start = extract_stat_start(
            stat_period_text,
            date_precision,
        )

        # 気温
        temp_match = re.search(r"(-?\d+(?:\.\d+)?)", first_rank_text,)

        if not temp_match:
            return {
                "record_value": None,
                "record_date": "",
                "stat_start": "",
                "status": "temperature_not_found",
            }

        temperature = float(temp_match.group(1))

        record_date = extract_record_date(first_rank_text, date_precision,)

        return {
            "record_value":
                temperature,
            "record_date":
                record_date,
            "stat_start":
                stat_start,
            "status":
                "success",
        }

    return {
        "record_value": None,
        "record_date": "",
        "stat_start": "",
        "status": "target_row_not_found",
    }

# =========================================================
# GeoJSON Feature生成
# =========================================================

def make_feature(row: pd.Series,) -> dict:

    record_url = (nullable_text(row.get("record_rank_url")))

    properties = {
        "amedas_code":
            nullable_int_string(row.get("amedas_code"), width=5,),
        "name":
            nullable_text(row.get("name")),
        "name_kana":
            nullable_text(row.get("name_kana")),
        "name_en":
            nullable_text(row.get("name_en")),
        "altitude_m":
            nullable_float(row.get("altitude_m")),
        "record_value":
            nullable_float(row.get("record_value")),
        "record_date":
            nullable_text(row.get("record_date")),
        "stat_start":
            nullable_text(row.get("stat_start")),
        "record_status":
            nullable_text(row.get("record_status")),
        "prec_no":
            nullable_int_string(row.get("prec_no"), width=2,),
        "block_no":
            nullable_int_string(row.get("block_no")),
        "station_class":
            nullable_text(row.get("station_class")),
        "record_rank_url":
            record_url,
    }

    return {
        "type":
            "Feature",
        "geometry": {
            "type":
                "Point",
            # GeoJSONは
            # [経度, 緯度]
            "coordinates": [float(row["longitude"]), float(row["latitude"]),],
        },
        "properties":
            properties,
    }


# =========================================================
# メイン
# =========================================================

def main() -> None:

    # ---------------------------------------------
    # 観測項目・月を決定
    # ---------------------------------------------

    args = parse_arguments()

    if args.record is None:
        # 従来の手動入力モード
        record_key, record_config = select_record_type()
        month = select_month(record_config)

    else:
        # 自動実行・コマンドラインモード
        record_key = args.record
        record_config = RECORD_TYPES[record_key]
        month = args.month

    target_row = record_config["jma_row"]

    # ---------------------------------------------
    # 出力先決定
    # ---------------------------------------------

    output_directory = (get_period_directory(month))
    output_geojson = (output_directory / record_config["filename"])
    failed_csv = (output_directory / record_config["failed_filename"])

    print()
    print("取得対象:")
    print("  観測項目 = " f"{record_config['label']}")
    print("  期間 = " + ("通年" if month == 0 else f"{month}月"))
    print("  出力 = " f"{output_geojson}")
    print()

    # ---------------------------------------------
    # 入力CSV確認
    # ---------------------------------------------

    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"{INPUT_CSV} " "が見つかりません。")

    # ---------------------------------------------
    # 地点一覧
    # ---------------------------------------------

    df = pd.read_csv(
        INPUT_CSV,

        dtype={
            "amedas_code":
                str,
            "prec_no":
                str,
            "block_no":
                str,
            "station_class":
                str,
        },
    )

    required_columns = {
        "name",
        "latitude",
        "longitude",
        "amedas_code",
        "prec_no",
        "block_no",
    }

    missing_columns = (required_columns - set(df.columns))
    if missing_columns:
        raise ValueError("入力CSVに必要な列がありません: " + ", ".join(sorted(missing_columns)))

    # ---------------------------------------------
    # 番号の整形
    # ---------------------------------------------

    df["amedas_code"] = (df["amedas_code"] .str.zfill(5))
    df["prec_no"] = (df["prec_no"] .str.zfill(2))
    df["block_no"] = (df["block_no"] .fillna(""))
    df["station_class"] = (df["station_class"] .fillna(""))

    # ---------------------------------------------
    # HTTP Session
    # ---------------------------------------------

    session = (requests.Session())

    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 "
                "(compatible; "
                "AMeDASRecordMap/1.0; "
                "personal meteorological "
                "research)"
            )
        }
    )

    records = []
    record_dates = []
    stat_starts = []
    statuses = []
    actual_urls = []
    total = len(df)

    # ---------------------------------------------
    # 全地点取得
    # ---------------------------------------------

    for i, row in df.iterrows():
        number = i + 1
        name = row["name"]
        prec_no = row["prec_no"]
        block_no = row["block_no"]
        station_class = row["station_class"]
        print(
            f"[{number:03d}/" f"{total:03d}] "
            f"{name} "
            f"prec_no={prec_no} "
            f"block_no={block_no}"
        )

        # -----------------------------------------
        # block_noなし
        # -----------------------------------------
        if not block_no:
            records.append(None)
            record_dates.append("")
            stat_starts.append("")
            statuses.append("block_no_missing")
            actual_urls.append("")
            print("    skip: " "block_noなし")
            continue

        # -----------------------------------------
        # station_class推定
        # -----------------------------------------

        if station_class not in {"s", "a",}:
            station_class = ("s" if re.fullmatch(r"47\d{3}", block_no,) else "a")

        # -----------------------------------------
        # URL
        # -----------------------------------------

        url = make_rank_url(
            prec_no=
                prec_no,
            block_no=
                block_no,
            station_class=
                station_class,
            month=
                month,
        )

        actual_urls.append(url)

        # -----------------------------------------
        # 取得
        # -----------------------------------------

        try:
            result = extract_record(
                session=session,
                url=url,
                target_row=target_row,
                date_precision=record_config["date_precision"],
            )
            
            records.append(result["record_value"])
            record_dates.append(result["record_date"])
            stat_starts.append(result["stat_start"])
            statuses.append(result["status"])

            print(
                "    "
                f"{result['record_value']} ℃ "
                f"{result['record_date']} "
                f"統計開始={result['stat_start']}"
            )

        except (requests.RequestException) as exc:
            records.append(None)
            record_dates.append("")
            stat_starts.append("")
            statuses.append(f"request_error: " f"{exc}")
            print(f"    ERROR: " f"{exc}")

        except Exception as exc:
            records.append(None)
            record_dates.append("")
            stat_starts.append("")
            statuses.append(f"parse_error: " f"{exc}")
            print(f"    ERROR: " f"{exc}")

        time.sleep(REQUEST_INTERVAL)

    # ---------------------------------------------
    # 結果をDataFrameへ追加
    # ---------------------------------------------

    df["record_value"] = records
    df["record_date"] = record_dates
    df["stat_start"] = stat_starts
    df["record_status"] = statuses
    df["record_rank_url"] = actual_urls

    # ---------------------------------------------
    # 出力フォルダ
    # ---------------------------------------------

    output_directory.mkdir(parents=True, exist_ok=True,)

    # ---------------------------------------------
    # 失敗一覧
    # ---------------------------------------------

    failed = df[df["record_status"] != "success"].copy()

    if not failed.empty:
        failed.to_csv(failed_csv, index=False, encoding="utf-8-sig",)
        
    elif failed_csv.exists():
        failed_csv.unlink()

    # ---------------------------------------------
    # GeoJSON対象
    # ---------------------------------------------

    map_df = df.dropna(subset=["latitude", "longitude",]).copy()

    if not INCLUDE_MISSING:
        map_df = map_df[map_df["record_status"] == "success"].copy()

    # ---------------------------------------------
    # GeoJSON生成
    # ---------------------------------------------

    features = [make_feature(row) for _, row in map_df.iterrows()]
    geojson = {"type": "FeatureCollection", "features": features,}

    with output_geojson.open("w", encoding="utf-8",) as file:
        json.dump(geojson, file, ensure_ascii=False, indent=2,)

    # ---------------------------------------------
    # 完了表示
    # ---------------------------------------------

    success_count = int((df["record_status"] == "success").sum())

    print()
    print("===== 完了 =====")
    print("観測項目: " f"{record_config['label']}")
    print("対象期間: " + ("通年" if month == 0 else f"{month}月"))
    print(f"全地点: " f"{len(df)}")
    print(f"取得成功: " f"{success_count}")
    print(f"失敗・未処理: " f"{len(failed)}")
    print(f"GeoJSON出力地点数: " f"{len(map_df)}")
    print("GeoJSON出力: " f"{output_geojson.resolve()}")
    if not failed.empty:
        print("失敗一覧: " f"{failed_csv.resolve()}")


if __name__ == "__main__":
    main()